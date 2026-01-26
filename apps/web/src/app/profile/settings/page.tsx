'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeftIcon,
  BellIcon,
  EnvelopeIcon,
  DevicePhoneMobileIcon,
  ShieldCheckIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
  ShoppingBagIcon,
  ChatBubbleLeftRightIcon,
  TagIcon,
  MegaphoneIcon,
  KeyIcon,
  FingerPrintIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { useTranslation } from '@/i18n/LanguageContext';

interface NotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  marketingEmails: boolean;
  orderUpdates: boolean;
  messageAlerts: boolean;
  priceDropAlerts: boolean;
  newListingAlerts: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const { isAuthenticated, user, logout } = useAuthStore();
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  
  const [settings, setSettings] = useState<NotificationSettings>({
    emailNotifications: true,
    pushNotifications: true,
    smsNotifications: false,
    marketingEmails: false,
    orderUpdates: true,
    messageAlerts: true,
    priceDropAlerts: true,
    newListingAlerts: false,
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/profile/settings');
      return;
    }
    loadSettings();
  }, [isAuthenticated]);

  const loadSettings = async () => {
    try {
      const response = await api.get('/users/me/settings').catch(() => null);
      if (response?.data) {
        setSettings(prev => ({ ...prev, ...response.data }));
      }
    } catch (error) {
      // Use defaults
    }
  };

  const handleToggle = async (key: keyof NotificationSettings) => {
    const newValue = !settings[key];
    setSettings(prev => ({ ...prev, [key]: newValue }));
    
    try {
      await api.patch('/users/me/settings', { [key]: newValue }).catch(() => null);
      toast.success(locale === 'en' ? 'Setting updated' : 'Ayar güncellendi');
    } catch (error) {
      setSettings(prev => ({ ...prev, [key]: !newValue }));
      toast.error(locale === 'en' ? 'Failed to update setting' : 'Ayar güncellenemedi');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'SİL') {
      toast.error(locale === 'en' ? 'Please type SİL to confirm' : 'Onaylamak için SİL yazın');
      return;
    }
    
    setLoading(true);
    try {
      await api.delete('/users/me');
      toast.success(locale === 'en' ? 'Your account has been deleted' : 'Hesabınız silindi');
      logout();
      router.push('/');
    } catch (error: any) {
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to delete account' : 'Hesap silinemedi'));
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  const Toggle = ({ enabled, onChange }: { enabled: boolean; onChange: () => void }) => (
    <button
      type="button"
      onClick={onChange}
      className={`relative w-12 h-6 rounded-full transition-colors ${
        enabled ? 'bg-orange-500' : 'bg-gray-300'
      }`}
    >
      <motion.div
        animate={{ x: enabled ? 24 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-1 w-4 h-4 bg-white rounded-full shadow"
      />
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-orange-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-4 transition-colors group"
          >
            <ArrowLeftIcon className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">{locale === 'en' ? 'Back to Profile' : 'Profile Dön'}</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <Cog6ToothIcon className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">
                {locale === 'en' ? 'Settings' : 'Ayarlar'}
              </h1>
              <p className="text-white/80 mt-1">
                {locale === 'en' ? 'Manage your preferences' : 'Tercihlerinizi yönetin'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8 -mt-4 space-y-6">
        {/* Notification Settings */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <BellIcon className="w-5 h-5 text-orange-500" />
              {locale === 'en' ? 'Notification Preferences' : 'Bildirim Tercihleri'}
            </h2>
          </div>

          <div className="divide-y divide-gray-100">
            {/* Email Notifications */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <EnvelopeIcon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {locale === 'en' ? 'Email Notifications' : 'E-posta Bildirimleri'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {locale === 'en' ? 'Receive important updates via email' : 'Önemli güncellemeler için e-posta al'}
                  </p>
                </div>
              </div>
              <Toggle enabled={settings.emailNotifications} onChange={() => handleToggle('emailNotifications')} />
            </div>

            {/* Push Notifications */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                  <DevicePhoneMobileIcon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {locale === 'en' ? 'Push Notifications' : 'Anlık Bildirimler'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {locale === 'en' ? 'Receive browser notifications' : 'Tarayıcı bildirimleri al'}
                  </p>
                </div>
              </div>
              <Toggle enabled={settings.pushNotifications} onChange={() => handleToggle('pushNotifications')} />
            </div>

            {/* Order Updates */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                  <ShoppingBagIcon className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {locale === 'en' ? 'Order Updates' : 'Sipariş Güncellemeleri'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {locale === 'en' ? 'Get notified about order status changes' : 'Sipariş durumu değişikliklerinde bildirim al'}
                  </p>
                </div>
              </div>
              <Toggle enabled={settings.orderUpdates} onChange={() => handleToggle('orderUpdates')} />
            </div>

            {/* Message Alerts */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center">
                  <ChatBubbleLeftRightIcon className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {locale === 'en' ? 'Message Alerts' : 'Mesaj Uyarıları'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {locale === 'en' ? 'Get notified when you receive a new message' : 'Yeni mesaj geldiğinde bildirim al'}
                  </p>
                </div>
              </div>
              <Toggle enabled={settings.messageAlerts} onChange={() => handleToggle('messageAlerts')} />
            </div>

            {/* Price Drop Alerts */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                  <TagIcon className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {locale === 'en' ? 'Price Drop Alerts' : 'Fiyat Düşüşü Uyarıları'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {locale === 'en' ? 'Get notified when favorite items go on sale' : 'Favori ürünlerde fiyat düşünce haber ver'}
                  </p>
                </div>
              </div>
              <Toggle enabled={settings.priceDropAlerts} onChange={() => handleToggle('priceDropAlerts')} />
            </div>

            {/* Marketing Emails */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                  <MegaphoneIcon className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {locale === 'en' ? 'Marketing Emails' : 'Pazarlama E-postaları'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {locale === 'en' ? 'Receive promotions and special offers' : 'Kampanya ve fırsatlardan haberdar ol'}
                  </p>
                </div>
              </div>
              <Toggle enabled={settings.marketingEmails} onChange={() => handleToggle('marketingEmails')} />
            </div>
          </div>
        </motion.div>

        {/* Security Settings */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ShieldCheckIcon className="w-5 h-5 text-orange-500" />
              {locale === 'en' ? 'Security' : 'Güvenlik'}
            </h2>
          </div>

          <div className="divide-y divide-gray-100">
            <Link
              href="/profile/change-password"
              className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                  <KeyIcon className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {locale === 'en' ? 'Change Password' : 'Şifre Değiştir'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {locale === 'en' ? 'Update your account password' : 'Hesap şifrenizi güncelleyin'}
                  </p>
                </div>
              </div>
              <ArrowLeftIcon className="w-5 h-5 text-gray-400 rotate-180" />
            </Link>

            <div className="flex items-center justify-between p-5 opacity-60">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                  <FingerPrintIcon className="w-5 h-5 text-gray-500" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">
                    {locale === 'en' ? 'Two-Factor Authentication' : 'İki Faktörlü Doğrulama'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {locale === 'en' ? 'Add an extra layer of security' : 'Ekstra güvenlik katmanı ekleyin'}
                  </p>
                </div>
              </div>
              <span className="text-xs bg-gray-200 text-gray-600 px-3 py-1 rounded-full font-medium">
                {locale === 'en' ? 'Coming Soon' : 'Yakında'}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Danger Zone */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-red-50 rounded-2xl border border-red-200 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-red-200 bg-red-100/50">
            <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5" />
              {locale === 'en' ? 'Danger Zone' : 'Tehlikeli Bölge'}
            </h2>
          </div>

          <div className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-medium text-red-800">
                  {locale === 'en' ? 'Delete Account' : 'Hesabı Sil'}
                </p>
                <p className="text-sm text-red-600">
                  {locale === 'en' 
                    ? 'Permanently delete your account and all data' 
                    : 'Hesabınızı ve tüm verilerinizi kalıcı olarak silin'}
                </p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <TrashIcon className="w-4 h-4" />
                {locale === 'en' ? 'Delete Account' : 'Hesabı Sil'}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {locale === 'en' ? 'Delete Account?' : 'Hesabı Sil?'}
                </h3>
                <p className="text-gray-500">
                  {locale === 'en' 
                    ? 'This action cannot be undone. All your data, listings, and order history will be permanently deleted.' 
                    : 'Bu işlem geri alınamaz. Tüm verileriniz, ilanlarınız ve sipariş geçmişiniz kalıcı olarak silinecektir.'}
                </p>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {locale === 'en' ? 'Type SİL to confirm:' : 'Onaylamak için SİL yazın:'}
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  placeholder="SİL"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
                >
                  {locale === 'en' ? 'Cancel' : 'İptal'}
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={loading || deleteConfirmText !== 'SİL'}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading 
                    ? (locale === 'en' ? 'Deleting...' : 'Siliniyor...') 
                    : (locale === 'en' ? 'Yes, Delete' : 'Evet, Sil')}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
