'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  BellIcon,
  EnvelopeIcon,
  DevicePhoneMobileIcon,
  ShieldCheckIcon,
  TrashIcon,
  ExclamationTriangleIcon,
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
    // Load settings from API if available
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
      // Revert on error
      setSettings(prev => ({ ...prev, [key]: !newValue }));
      toast.error(locale === 'en' ? 'Failed to update setting' : 'Ayar güncellenemedi');
    }
  };

  const handleDeleteAccount = async () => {
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

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/profile"
            className="p-2 hover:bg-gray-800 rounded-full transition-colors"
          >
            <ArrowLeftIcon className="w-6 h-6" />
          </Link>
          <h1 className="text-2xl font-bold">Ayarlar</h1>
        </div>

        {/* Notification Settings */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BellIcon className="w-5 h-5 text-primary-500" />
            Bildirim Tercihleri
          </h2>

          <div className="space-y-4">
            {/* Email Notifications */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <EnvelopeIcon className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="font-medium">E-posta Bildirimleri</p>
                  <p className="text-sm text-gray-400">Önemli güncellemeler için e-posta al</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle('emailNotifications')}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.emailNotifications ? 'bg-primary-500' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.emailNotifications ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Push Notifications */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DevicePhoneMobileIcon className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="font-medium">Anlık Bildirimler</p>
                  <p className="text-sm text-gray-400">Tarayıcı bildirimleri al</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle('pushNotifications')}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.pushNotifications ? 'bg-primary-500' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.pushNotifications ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Order Updates */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Sipariş Güncellemeleri</p>
                <p className="text-sm text-gray-400">Sipariş durumu değişikliklerinde bildirim al</p>
              </div>
              <button
                onClick={() => handleToggle('orderUpdates')}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.orderUpdates ? 'bg-primary-500' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.orderUpdates ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Message Alerts */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Mesaj Uyarıları</p>
                <p className="text-sm text-gray-400">Yeni mesaj geldiğinde bildirim al</p>
              </div>
              <button
                onClick={() => handleToggle('messageAlerts')}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.messageAlerts ? 'bg-primary-500' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.messageAlerts ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Price Drop Alerts */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Fiyat Düşüşü Uyarıları</p>
                <p className="text-sm text-gray-400">Favori ürünlerde fiyat düşünce haber ver</p>
              </div>
              <button
                onClick={() => handleToggle('priceDropAlerts')}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.priceDropAlerts ? 'bg-primary-500' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.priceDropAlerts ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Marketing Emails */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Pazarlama E-postaları</p>
                <p className="text-sm text-gray-400">Kampanya ve fırsatlardan haberdar ol</p>
              </div>
              <button
                onClick={() => handleToggle('marketingEmails')}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.marketingEmails ? 'bg-primary-500' : 'bg-gray-600'
                }`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    settings.marketingEmails ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Security Settings */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-primary-500" />
            Güvenlik
          </h2>

          <div className="space-y-4">
            <Link
              href="/profile/change-password"
              className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-colors"
            >
              <div>
                <p className="font-medium">Şifre Değiştir</p>
                <p className="text-sm text-gray-400">Hesap şifrenizi güncelleyin</p>
              </div>
              <span className="text-gray-400">→</span>
            </Link>

            <div className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
              <div>
                <p className="font-medium">İki Faktörlü Doğrulama</p>
                <p className="text-sm text-gray-400">Ekstra güvenlik katmanı ekleyin</p>
              </div>
              <span className="text-xs bg-gray-600 px-2 py-1 rounded">Yakında</span>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-900/20 border border-red-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-400">
            <ExclamationTriangleIcon className="w-5 h-5" />
            Tehlikeli Bölge
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Hesabı Sil</p>
                <p className="text-sm text-gray-400">
                  Hesabınızı ve tüm verilerinizi kalıcı olarak silin
                </p>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <TrashIcon className="w-4 h-4" />
                Hesabı Sil
              </button>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-gray-800 rounded-2xl p-6 max-w-md mx-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold mb-2">Hesabı Sil</h3>
                <p className="text-gray-400">
                  Bu işlem geri alınamaz. Tüm verileriniz, ilanlarınız ve siparişleriniz silinecektir.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={loading}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? (locale === 'en' ? 'Deleting...' : 'Siliniyor...') : (locale === 'en' ? 'Yes, Delete' : 'Evet, Sil')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
