'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import OptimizedImage from '@/components/OptimizedImage';
import UserAvatar from '@/components/UserAvatar';
import { motion } from 'framer-motion';
import { 
  ArrowLeftIcon, 
  CameraIcon, 
  UserCircleIcon,
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  CalendarIcon,
  PencilSquareIcon,
  BuildingOfficeIcon,
  IdentificationIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Button, Input, Spinner, Textarea } from '@tarodan/ui';
import { api, mediaApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import { useTranslation } from '@/i18n/LanguageContext';

export default function EditProfilePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, user, setUser, refreshUser } = useAuthStore();
  const { t, locale } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isBusinessTier = user?.membershipTier === 'business';
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    birthDate: '',
    bio: '',
    isCorporateSeller: false,
    companyName: '',
    taxId: '',
    taxOffice: '',
  });

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (user) {
      const hasCompanyName = !!user.companyName;
      setFormData({
        displayName: user.displayName || '',
        email: user.email || '',
        phone: user.phone || '',
        birthDate: user.birthDate ? new Date(user.birthDate).toISOString().split('T')[0] : '',
        bio: user.bio || '',
        isCorporateSeller: hasCompanyName || false,
        companyName: user.companyName || '',
        taxId: user.taxId || '',
        taxOffice: '',
      });
      if (user.avatarUrl) {
        setProfilePhoto(user.avatarUrl);
      }
    }
  }, [authLoading, isAuthenticated, user]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error(locale === 'en' ? 'Please select an image file' : 'Lütfen bir resim dosyası seçin');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(locale === 'en' ? 'File size must be less than 5MB' : 'Dosya boyutu 5MB\'dan küçük olmalıdır');
      return;
    }

    setUploadingPhoto(true);
    try {
      // 1. Upload to /media/upload/avatar (avatars bucket, entityType=user, uploaderId set)
      const uploadResponse = await mediaApi.uploadAvatar(file);

      const s3Key = uploadResponse.data.key; // e.g. "dev/avatars/userId/abc123.jpg"
      // Avatar S3'te private; upload yanıtı anlık gösterim için presigned URL döner
      const displayUrl = uploadResponse.data.url as string | undefined;

      if (process.env.NODE_ENV === 'development') {
        console.log('Avatar uploaded, S3 key:', s3Key);
      }

      // 2. Save S3 key to user record
      await api.patch('/users/me', { avatarUrl: s3Key });

      // 3. Immediate display: upload yanıtındaki presigned URL (yoksa yerel önizleme)
      setProfilePhoto(displayUrl || URL.createObjectURL(file));

      // 4. Refresh user data in store
      await refreshUser();
      toast.success(locale === 'en' ? 'Profile photo updated' : 'Profil fotoğrafı güncellendi');
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Photo upload error:', error);
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to upload photo' : 'Fotoğraf yüklenemedi'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Prepare data to send
      const dataToSend: any = { ...formData };
      
      // Remove email - it's read-only and not in the DTO
      delete dataToSend.email;
      
      // Convert empty strings to undefined to avoid validation errors
      Object.keys(dataToSend).forEach((key) => {
        if (dataToSend[key] === '') {
          dataToSend[key] = undefined;
        }
      });
      
      if (!isBusinessTier) {
        // Remove business information fields for non-business users
        delete dataToSend.companyName;
        delete dataToSend.taxId;
        delete dataToSend.taxOffice;
        delete dataToSend.isCorporateSeller;
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Profile update request:', dataToSend);
      }
      
      const response = await api.patch('/users/me', dataToSend);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Profile update response:', response.data);
      }
      
      // Refresh user data in store (runs through mapApiUser for proper field mapping)
      await refreshUser();
      setSaved(true);
      toast.success(locale === 'en' ? 'Profile updated successfully!' : 'Profil başarıyla güncellendi!');
      setTimeout(() => setSaved(false), 3000);
      // Redirect to profile page after successful update
      setTimeout(() => {
        router.push('/profile');
      }, 1000);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Profile update error:', error);
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to update profile' : 'Profil güncellenemedi'));
    } finally {
      setLoading(false);
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
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-inverted/80 hover:text-inverted mb-4 transition-colors group"
          >
            <ArrowLeftIcon className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">{locale === 'en' ? 'Back to Profile' : 'Profile Dön'}</span>
          </Link>
          
          <div className="flex items-center gap-6">
            {/* Profile Photo */}
            <div className="relative">
              <div className="w-28 h-28 rounded-2xl overflow-hidden bg-surface-elevated/20 border-4 border-surface-elevated/30 shadow-lg">
                {profilePhoto ? (
                  <OptimizedImage
                    src={profilePhoto}
                    alt="Profil Fotoğrafı"
                    fill
                    className="object-cover"
                    logContext={{ page: 'profile-edit-avatar' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-2">
                    <UserAvatar displayName={user?.displayName} avatarUrl={user?.avatarUrl} size="xl" className="!w-full !h-full !text-4xl text-inverted/90 bg-surface-elevated/20" />
                  </div>
                )}
              </div>
              <Button variant="secondary" type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute -bottom-2 -right-2 w-10 h-10 bg-surface-elevated text-primary-500 hover:bg-primary-50 rounded-xl shadow-lg flex items-center justify-center transition-all disabled:opacity-50">
                {uploadingPhoto ? (
                  <Spinner size="sm" color="border-primary-500 border-t-transparent" />
                ) : (
                  <CameraIcon className="w-5 h-5" />
                )}
              </Button>
              <Input ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden" />
            </div>
            
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">
                {locale === 'en' ? 'Edit Profile' : 'Profili Düzenle'}
              </h1>
              <p className="text-inverted/80 mt-1">
                {locale === 'en' ? 'Update your personal information' : 'Kişisel bilgilerinizi güncelleyin'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8 -mt-4">
        <motion.form 
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Personal Information Card */}
          <div className="bg-surface-elevated rounded-2xl shadow-sm border border-border-subtle overflow-hidden">
            <div className="px-6 py-4 border-b border-border-subtle bg-surface/50">
              <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-primary-500" />
                {locale === 'en' ? 'Personal Information' : 'Kişisel Bilgiler'}
              </h2>
            </div>
            
            <div className="p-6 space-y-5">
              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === 'en' ? 'Display Name' : 'Görünen İsim'} <span className="text-danger-500">*</span>
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                  <Input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="pl-12 pr-4 h-12 rounded-xl border-border transition-all"
                    placeholder={locale === 'en' ? 'Your name' : 'Adınız'}
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === 'en' ? 'Email Address' : 'E-posta Adresi'}
                </label>
                <div className="relative">
                  <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                  <Input
                    type="email"
                    value={formData.email}
                    className="pl-12 pr-4 h-12 rounded-xl border-border bg-surface text-muted cursor-not-allowed"
                    disabled
                  />
                </div>
                <p className="text-xs text-muted mt-1.5 flex items-center gap-1">
                  <span>🔒</span>
                  {locale === 'en' ? 'Contact support to change email' : 'E-posta değişikliği için destek ile iletişime geçin'}
                </p>
              </div>

              {/* Phone and Birth Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-body mb-2">
                    {locale === 'en' ? 'Phone Number' : 'Telefon Numarası'}
                  </label>
                  <div className="relative">
                    <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                    <Input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="pl-12 pr-4 h-12 rounded-xl border-border transition-all"
                      placeholder="+90 555 123 4567"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-body mb-2">
                    {locale === 'en' ? 'Birth Date' : 'Doğum Tarihi'}
                  </label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                    <Input
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                      max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                      className="pl-12 pr-4 h-12 rounded-xl border-border transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === 'en' ? 'About Me' : 'Hakkımda'}
                </label>
                <div className="relative">
                  <PencilSquareIcon className="absolute left-4 top-4 w-5 h-5 text-subtle" />
                  <Textarea value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    className="pl-12 pr-4 py-3 border-border rounded-xl transition-all resize-none"
                    rows={4}
                    placeholder={locale === 'en' ? 'Tell us about yourself and your collection...' : 'Kendiniz ve koleksiyonunuz hakkında bilgi verin...'}
                    maxLength={500} />
                </div>
                <p className="text-xs text-subtle mt-1 text-right">{formData.bio.length}/500</p>
              </div>
            </div>
          </div>

          {/* Business Information Card - Only visible for business tier users */}
          {isBusinessTier && (
          <div className="bg-surface-elevated rounded-2xl shadow-sm border border-border-subtle overflow-hidden">
            <div className="px-6 py-4 border-b border-border-subtle bg-surface/50">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-heading flex items-center gap-2">
                  <BuildingOfficeIcon className="w-5 h-5 text-primary-500" />
                  {locale === 'en' ? 'Business Information' : 'İşletme Bilgileri'}
                </h2>
                <span className="px-3 py-1 bg-primary-100 text-primary-600 text-xs font-medium rounded-full">
                  {locale === 'en' ? 'Business Tier' : 'İş Üyeliği'}
                </span>
              </div>
            </div>
            
            <div className="p-6 space-y-5">
              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium text-body mb-2">
                  {locale === 'en' ? 'Company Name' : 'Şirket / Ticari Unvan'}
                  <span className="text-danger-500"> *</span>
                </label>
                <div className="relative">
                  <BuildingOfficeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                  <Input
                    type="text"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="pl-12 pr-4 h-12 rounded-xl border-border transition-all"
                    placeholder="ABC Ltd. Şti."
                    required
                  />
                </div>
                {!formData.companyName && (
                  <p className="text-xs text-primary-600 mt-1.5 flex items-center gap-1">
                    ⚠️ {locale === 'en' ? 'Company name is required for business tier' : 'İşletme panelini kullanmak için şirket adı zorunludur'}
                  </p>
                )}
              </div>

              {/* Tax Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-body mb-2">
                    {locale === 'en' ? 'Tax ID' : 'Vergi Kimlik No'}
                  </label>
                  <div className="relative">
                    <IdentificationIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-subtle" />
                    <Input
                      type="text"
                      value={formData.taxId}
                      onChange={(e) => setFormData({ ...formData, taxId: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                      className="pl-12 pr-4 h-12 rounded-xl border-border transition-all"
                      placeholder="1234567890"
                      maxLength={11}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-body mb-2">
                    {locale === 'en' ? 'Tax Office' : 'Vergi Dairesi'}
                  </label>
                  <Input
                    type="text"
                    value={formData.taxOffice}
                    onChange={(e) => setFormData({ ...formData, taxOffice: e.target.value })}
                    className="h-12 px-4 rounded-xl border-border transition-all"
                    placeholder="Kadıköy VD"
                  />
                </div>
              </div>

              <div className="p-4 bg-info-50 border border-info-100 rounded-xl">
                <p className="text-sm text-info-700">
                  ℹ️ {locale === 'en' 
                    ? 'Business information is used for invoicing. Incorrect information may result in legal liability.' 
                    : 'Kurumsal satıcı bilgileri fatura kesiminde kullanılır. Yanlış bilgi girişi yasal sorumluluk doğurabilir.'}
                </p>
              </div>
            </div>
          </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
            <Button variant="secondary" type="button"
              onClick={() => router.back()}
              className="flex-1 px-6 py-3.5 bg-surface-alt hover:bg-border-subtle text-body font-medium rounded-xl transition-colors">
              {locale === 'en' ? 'Cancel' : 'İptal'}
            </Button>
            <Button variant="secondary" type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3.5 bg-gradient-to-r from-primary-500 to-warning-500 hover:from-primary-600 hover:to-warning-600 text-inverted font-semibold rounded-xl transition-all shadow-lg shadow-primary-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              {loading ? (
                <>
                  <Spinner size="sm" color="border-surface-elevated border-t-transparent" />
                  {locale === 'en' ? 'Saving...' : 'Kaydediliyor...'}
                </>
              ) : saved ? (
                <>
                  <CheckCircleIcon className="w-5 h-5" />
                  {locale === 'en' ? 'Saved!' : 'Kaydedildi!'}
                </>
              ) : (
                locale === 'en' ? 'Save Changes' : 'Değişiklikleri Kaydet'
              )}
            </Button>
          </div>

          {/* Settings Link */}
          <div className="text-center pt-4">
            <Link
              href="/profile/settings"
              className="text-sm text-muted hover:text-primary-600 transition-colors"
            >
              {locale === 'en' ? 'Looking for account settings?' : 'Hesap ayarlarını mı arıyorsunuz?'}{' '}
              <span className="underline">{locale === 'en' ? 'Click here' : 'Tıklayın'}</span>
            </Link>
          </div>
        </motion.form>
      </main>
    </div>
  );
}
