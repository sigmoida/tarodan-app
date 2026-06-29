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
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Button, Input, Modal } from '@tarodan/ui';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
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

/**
 * Modül seviyesinde (component DIŞINDA) tanımlı — yoksa her render'da yeniden yaratılır,
 * tüm toggle'lar remount olur ve framer-motion hepsinde enter animasyonunu tekrar oynatır
 * (birini açınca hepsi oynuyordu). Sade <button> track + ortalanmış knob (UI <Button>'ın
 * padding'i hizayı bozuyordu).
 */
function Toggle({ enabled, onChange }: { enabled: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onChange}
      className={`relative inline-flex items-center w-12 h-6 rounded-full transition-colors shrink-0 ${
        enabled ? 'bg-primary-500' : 'bg-border-strong'
      }`}
    >
      <motion.span
        animate={{ x: enabled ? 26 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="block w-5 h-5 bg-surface-elevated rounded-full shadow"
      />
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user, logout, refreshUser } = useAuthStore();
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState(user?.phone || '');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<'enter' | 'verify'>('enter');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const intervalId = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(intervalId);
  }, [resendIn]);

  const handleSendPhoneCode = async () => {
    setPhoneLoading(true);
    try {
      await api.post('/auth/phone/send-code', { phone: phoneInput });
      toast.success(locale === 'en' ? 'Code sent' : 'Kod gönderildi');
      setPhoneStep('verify');
      setResendIn(60);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || (locale === 'en' ? 'Failed' : 'Gönderilemedi'));
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyPhone = async () => {
    setPhoneLoading(true);
    try {
      await api.post('/auth/phone/verify', { code: phoneCode });
      toast.success(locale === 'en' ? 'Phone verified' : 'Telefon doğrulandı');
      setShowPhoneModal(false);
      setPhoneStep('enter');
      setPhoneCode('');
      await refreshUser();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || (locale === 'en' ? 'Invalid code' : 'Kod hatalı'));
    } finally {
      setPhoneLoading(false);
    }
  };
  
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
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/profile/settings');
      return;
    }
    loadSettings();
  }, [authLoading, isAuthenticated]);

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
      // .catch(() => null) KALDIRILDI: hatayı yutuyordu → istek başarısız olsa bile
      // her zaman "güncellendi" toast'ı çıkıyordu. Artık gerçek sonucu yansıtır.
      await api.patch('/users/me/settings', { [key]: newValue });
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
      // Show detailed error messages if available
      const errorData = error.response?.data;
      if (errorData?.errors && Array.isArray(errorData.errors)) {
        // Show main message
        toast.error(errorData.message || (locale === 'en' ? 'Cannot delete account' : 'Hesap silinemez'));
        // Show each error detail
        errorData.errors.forEach((err: string) => {
          toast.error(err, { duration: 5000 });
        });
      } else {
        toast.error(errorData?.message || (locale === 'en' ? 'Failed to delete account' : 'Hesap silinemedi'));
      }
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  if (authLoading) {
    return <AuthLoadingScreen />;
  }
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface-elevated to-primary-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-500 to-warning-500 text-inverted">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-inverted/80 hover:text-inverted mb-4 transition-colors group"
          >
            <ArrowLeftIcon className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">{locale === 'en' ? 'Back to Profile' : 'Profile Dön'}</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-surface-elevated/20 rounded-2xl flex items-center justify-center">
              <Cog6ToothIcon className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">
                {locale === 'en' ? 'Settings' : 'Ayarlar'}
              </h1>
              <p className="text-inverted/80 mt-1">
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
          className="bg-surface-elevated rounded-2xl shadow-sm border border-border-subtle overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border-subtle bg-surface/50">
            <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
              <BellIcon className="w-5 h-5 text-primary-500" />
              {locale === 'en' ? 'Notification Preferences' : 'Bildirim Tercihleri'}
            </h2>
          </div>

          <div className="divide-y divide-border-subtle">
            {/* Email Notifications */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-info-50 rounded-xl flex items-center justify-center">
                  <EnvelopeIcon className="w-5 h-5 text-info-600" />
                </div>
                <div>
                  <p className="font-medium text-heading">
                    {locale === 'en' ? 'Email Notifications' : 'E-posta Bildirimleri'}
                  </p>
                  <p className="text-sm text-muted">
                    {locale === 'en' ? 'Receive important updates via email' : 'Önemli güncellemeler için e-posta al'}
                  </p>
                </div>
              </div>
              <Toggle enabled={settings.emailNotifications} onChange={() => handleToggle('emailNotifications')} />
            </div>

            {/* Push Notifications */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
                  <DevicePhoneMobileIcon className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-heading">
                    {locale === 'en' ? 'Push Notifications' : 'Anlık Bildirimler'}
                  </p>
                  <p className="text-sm text-muted">
                    {locale === 'en' ? 'Receive browser notifications' : 'Tarayıcı bildirimleri al'}
                  </p>
                </div>
              </div>
              <Toggle enabled={settings.pushNotifications} onChange={() => handleToggle('pushNotifications')} />
            </div>

            {/* Order Updates */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-success-50 rounded-xl flex items-center justify-center">
                  <ShoppingBagIcon className="w-5 h-5 text-success-600" />
                </div>
                <div>
                  <p className="font-medium text-heading">
                    {locale === 'en' ? 'Order Updates' : 'Sipariş Güncellemeleri'}
                  </p>
                  <p className="text-sm text-muted">
                    {locale === 'en' ? 'Get notified about order status changes' : 'Sipariş durumu değişikliklerinde bildirim al'}
                  </p>
                </div>
              </div>
              <Toggle enabled={settings.orderUpdates} onChange={() => handleToggle('orderUpdates')} />
            </div>

            {/* Message Alerts */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-info-50 rounded-xl flex items-center justify-center">
                  <ChatBubbleLeftRightIcon className="w-5 h-5 text-info-600" />
                </div>
                <div>
                  <p className="font-medium text-heading">
                    {locale === 'en' ? 'Message Alerts' : 'Mesaj Uyarıları'}
                  </p>
                  <p className="text-sm text-muted">
                    {locale === 'en' ? 'Get notified when you receive a new message' : 'Yeni mesaj geldiğinde bildirim al'}
                  </p>
                </div>
              </div>
              <Toggle enabled={settings.messageAlerts} onChange={() => handleToggle('messageAlerts')} />
            </div>

            {/* Price Drop Alerts */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-danger-50 rounded-xl flex items-center justify-center">
                  <TagIcon className="w-5 h-5 text-danger-600" />
                </div>
                <div>
                  <p className="font-medium text-heading">
                    {locale === 'en' ? 'Price Drop Alerts' : 'Fiyat Düşüşü Uyarıları'}
                  </p>
                  <p className="text-sm text-muted">
                    {locale === 'en' ? 'Get notified when favorite items go on sale' : 'Favori ürünlerde fiyat düşünce haber ver'}
                  </p>
                </div>
              </div>
              <Toggle enabled={settings.priceDropAlerts} onChange={() => handleToggle('priceDropAlerts')} />
            </div>

            {/* Marketing Emails */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-warning-50 rounded-xl flex items-center justify-center">
                  <MegaphoneIcon className="w-5 h-5 text-warning-600" />
                </div>
                <div>
                  <p className="font-medium text-heading">
                    {locale === 'en' ? 'Marketing Emails' : 'Pazarlama E-postaları'}
                  </p>
                  <p className="text-sm text-muted">
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
          className="bg-surface-elevated rounded-2xl shadow-sm border border-border-subtle overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border-subtle bg-surface/50">
            <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
              <ShieldCheckIcon className="w-5 h-5 text-primary-500" />
              {locale === 'en' ? 'Security' : 'Güvenlik'}
            </h2>
          </div>

          <div className="divide-y divide-border-subtle">
            <Link
              href="/profile/change-password"
              className="flex items-center justify-between p-5 hover:bg-surface transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-info-50 rounded-xl flex items-center justify-center">
                  <KeyIcon className="w-5 h-5 text-info-600" />
                </div>
                <div>
                  <p className="font-medium text-heading">
                    {locale === 'en' ? 'Change Password' : 'Şifre Değiştir'}
                  </p>
                  <p className="text-sm text-muted">
                    {locale === 'en' ? 'Update your account password' : 'Hesap şifrenizi güncelleyin'}
                  </p>
                </div>
              </div>
              <ArrowLeftIcon className="w-5 h-5 text-subtle rotate-180" />
            </Link>

            <button
              type="button"
              onClick={() => {
                setPhoneInput(user?.phone || '');
                setPhoneStep('enter');
                setShowPhoneModal(true);
              }}
              className="w-full flex items-center justify-between p-5 hover:bg-surface transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-info-50 rounded-xl flex items-center justify-center">
                  <DevicePhoneMobileIcon className="w-5 h-5 text-info-600" />
                </div>
                <div>
                  <p className="font-medium text-heading">
                    {locale === 'en' ? 'Phone Verification' : 'Telefon Doğrulama'}
                  </p>
                  <p className="text-sm text-muted">
                    {user?.isPhoneVerified
                      ? (locale === 'en' ? 'Your phone is verified' : 'Telefonunuz doğrulandı')
                      : (locale === 'en' ? 'Verify your phone via SMS' : 'Telefonunuzu SMS ile doğrulayın')}
                  </p>
                </div>
              </div>
              {user?.isPhoneVerified ? (
                <span className="text-xs bg-success-50 text-success-700 px-3 py-1 rounded-full font-medium">
                  {locale === 'en' ? 'Verified' : 'Doğrulandı'}
                </span>
              ) : (
                <ArrowLeftIcon className="w-5 h-5 text-subtle rotate-180" />
              )}
            </button>
          </div>
        </motion.div>

        {/* Danger Zone */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-danger-50 rounded-2xl border border-danger-200 overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-danger-200 bg-danger-100/50">
            <h2 className="text-lg font-semibold text-danger-700 flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5" />
              {locale === 'en' ? 'Danger Zone' : 'Tehlikeli Bölge'}
            </h2>
          </div>

          <div className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-medium text-danger-800">
                  {locale === 'en' ? 'Delete Account' : 'Hesabı Sil'}
                </p>
                <p className="text-sm text-danger-600">
                  {locale === 'en' 
                    ? 'Permanently delete your account and all data' 
                    : 'Hesabınızı ve tüm verilerinizi kalıcı olarak silin'}
                </p>
              </div>
              <Button
                variant="danger"
                size="md"
                className="flex items-center gap-2 whitespace-nowrap"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <TrashIcon className="w-4 h-4" />
                {locale === 'en' ? 'Delete Account' : 'Hesabı Sil'}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Phone Verification Modal */}
        <Modal
          isOpen={showPhoneModal}
          onClose={() => { setShowPhoneModal(false); setPhoneStep('enter'); setPhoneCode(''); }}
          title={locale === 'en' ? 'Phone Verification' : 'Telefon Doğrulama'}
        >
          {phoneStep === 'enter' ? (
            <div className="space-y-4">
              <Input
                label={locale === 'en' ? 'Phone number' : 'Telefon numarası'}
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+905551234567"
              />
              <Button onClick={handleSendPhoneCode} disabled={phoneLoading || !phoneInput} className="w-full">
                {locale === 'en' ? 'Send Code' : 'Kod Gönder'}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Input
                label={locale === 'en' ? 'Verification code' : 'Doğrulama kodu'}
                value={phoneCode}
                onChange={(e) => setPhoneCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
              />
              <Button onClick={handleVerifyPhone} disabled={phoneLoading || phoneCode.length !== 6} className="w-full">
                {locale === 'en' ? 'Verify' : 'Doğrula'}
              </Button>
              <button
                type="button"
                onClick={handleSendPhoneCode}
                disabled={resendIn > 0 || phoneLoading}
                className="w-full text-sm text-muted disabled:opacity-50"
              >
                {resendIn > 0
                  ? `${locale === 'en' ? 'Resend in' : 'Tekrar gönder'} ${resendIn}s`
                  : (locale === 'en' ? 'Resend code' : 'Kodu tekrar gönder')}
              </button>
            </div>
          )}
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal isOpen={showDeleteConfirm} onClose={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }} title={locale === 'en' ? 'Delete Account?' : 'Hesabı Sil?'} maxWidth="max-w-md">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-danger-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ExclamationTriangleIcon className="w-8 h-8 text-danger-600" />
                </div>
                <p className="text-muted">
                  {locale === 'en'
                    ? 'This action cannot be undone. All your data, listings, and order history will be permanently deleted.'
                    : 'Bu işlem geri alınamaz. Tüm verileriniz, ilanlarınız ve sipariş geçmişiniz kalıcı olarak silinecektir.'}
                </p>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === 'en' ? 'Type SİL to confirm:' : 'Onaylamak için SİL yazın:'}
                </label>
                <Input type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="px-4 py-3 rounded-xl focus:ring-danger-500 focus:border-danger-500"
                  placeholder="SİL" />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  size="lg"
                  className="flex-1"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText('');
                  }}
                >
                  {locale === 'en' ? 'Cancel' : 'İptal'}
                </Button>
                <Button
                  variant="danger"
                  size="lg"
                  className="flex-1"
                  onClick={handleDeleteAccount}
                  disabled={loading || deleteConfirmText !== 'SİL'}
                >
                  {loading
                    ? (locale === 'en' ? 'Deleting...' : 'Siliniyor...')
                    : (locale === 'en' ? 'Yes, Delete' : 'Evet, Sil')}
                </Button>
              </div>
        </Modal>
      </main>
    </div>
  );
}
