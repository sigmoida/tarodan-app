'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
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
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/LanguageContext';

export default function EditProfilePage() {
  const router = useRouter();
  const { isAuthenticated, user, setUser } = useAuthStore();
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
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (user) {
      const hasCompanyName = !!(user as any).companyName;
      setFormData({
        displayName: user.displayName || '',
        email: user.email || '',
        phone: user.phone || '',
        birthDate: (user as any).birthDate ? new Date((user as any).birthDate).toISOString().split('T')[0] : '',
        bio: (user as any).bio || '',
        isCorporateSeller: hasCompanyName || (user as any).isCorporateSeller || false,
        companyName: (user as any).companyName || '',
        taxId: (user as any).taxId || '',
        taxOffice: (user as any).taxOffice || '',
      });
      if ((user as any).profilePhotoUrl || (user as any).avatarUrl) {
        setProfilePhoto((user as any).profilePhotoUrl || (user as any).avatarUrl);
      }
    }
  }, [isAuthenticated, user]);

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
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'profile');

      const response = await api.post('/media/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const uploadedUrl = response.data.url || response.data.fileUrl;
      const updateResponse = await api.patch('/users/me', { profilePhotoUrl: uploadedUrl });
      const updatedUser = updateResponse.data.user || updateResponse.data;
      
      setProfilePhoto(uploadedUrl);
      setUser(updatedUser);
      toast.success(locale === 'en' ? 'Profile photo updated' : 'Profil fotoğrafı güncellendi');
    } catch (error: any) {
      console.error('Photo upload error:', error);
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to upload photo' : 'Fotoğraf yüklenemedi'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await api.patch('/users/me', formData);
      const updatedUser = response.data.user || response.data;
      setUser(updatedUser);
      setSaved(true);
      toast.success(locale === 'en' ? 'Profile updated successfully!' : 'Profil başarıyla güncellendi!');
      setTimeout(() => setSaved(false), 3000);
    } catch (error: any) {
      console.error('Profile update error:', error);
      toast.error(error.response?.data?.message || (locale === 'en' ? 'Failed to update profile' : 'Profil güncellenemedi'));
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-orange-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <Link
            href="/profile"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-4 transition-colors group"
          >
            <ArrowLeftIcon className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            <span className="font-medium">{locale === 'en' ? 'Back to Profile' : 'Profile Dön'}</span>
          </Link>
          
          <div className="flex items-center gap-6">
            {/* Profile Photo */}
            <div className="relative">
              <div className="w-28 h-28 rounded-2xl overflow-hidden bg-white/20 border-4 border-white/30 shadow-lg">
                {profilePhoto ? (
                  <Image
                    src={profilePhoto}
                    alt="Profil Fotoğrafı"
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <UserCircleIcon className="w-16 h-16 text-white/60" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute -bottom-2 -right-2 w-10 h-10 bg-white text-orange-500 hover:bg-orange-50 rounded-xl shadow-lg flex items-center justify-center transition-all disabled:opacity-50"
              >
                {uploadingPhoto ? (
                  <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <CameraIcon className="w-5 h-5" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
              />
            </div>
            
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">
                {locale === 'en' ? 'Edit Profile' : 'Profili Düzenle'}
              </h1>
              <p className="text-white/80 mt-1">
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-orange-500" />
                {locale === 'en' ? 'Personal Information' : 'Kişisel Bilgiler'}
              </h2>
            </div>
            
            <div className="p-6 space-y-5">
              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {locale === 'en' ? 'Display Name' : 'Görünen İsim'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                    placeholder={locale === 'en' ? 'Your name' : 'Adınız'}
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {locale === 'en' ? 'Email Address' : 'E-posta Adresi'}
                </label>
                <div className="relative">
                  <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={formData.email}
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
                    disabled
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                  <span>🔒</span>
                  {locale === 'en' ? 'Contact support to change email' : 'E-posta değişikliği için destek ile iletişime geçin'}
                </p>
              </div>

              {/* Phone and Birth Date */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {locale === 'en' ? 'Phone Number' : 'Telefon Numarası'}
                  </label>
                  <div className="relative">
                    <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                      placeholder="+90 555 123 4567"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {locale === 'en' ? 'Birth Date' : 'Doğum Tarihi'}
                  </label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="date"
                      value={formData.birthDate}
                      onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                      max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                      className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {locale === 'en' ? 'About Me' : 'Hakkımda'}
                </label>
                <div className="relative">
                  <PencilSquareIcon className="absolute left-4 top-4 w-5 h-5 text-gray-400" />
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all resize-none"
                    rows={4}
                    placeholder={locale === 'en' ? 'Tell us about yourself and your collection...' : 'Kendiniz ve koleksiyonunuz hakkında bilgi verin...'}
                    maxLength={500}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-right">{formData.bio.length}/500</p>
              </div>
            </div>
          </div>

          {/* Business Information Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <BuildingOfficeIcon className="w-5 h-5 text-orange-500" />
                  {locale === 'en' ? 'Business Information' : 'İşletme Bilgileri'}
                </h2>
                {isBusinessTier && (
                  <span className="px-3 py-1 bg-orange-100 text-orange-600 text-xs font-medium rounded-full">
                    {locale === 'en' ? 'Business Tier' : 'İş Üyeliği'}
                  </span>
                )}
              </div>
            </div>
            
            <div className="p-6">
              {!isBusinessTier && (
                <div className="flex items-center justify-between mb-6 p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="font-medium text-gray-900">
                      {locale === 'en' ? 'Corporate Seller' : 'Kurumsal Satıcı'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {locale === 'en' ? 'Enable if you sell on behalf of a company' : 'Şirket adına satış yapıyorsanız aktifleştirin'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, isCorporateSeller: !formData.isCorporateSeller })}
                    className={`relative w-14 h-8 rounded-full transition-colors ${
                      formData.isCorporateSeller ? 'bg-orange-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                        formData.isCorporateSeller ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              )}

              {(formData.isCorporateSeller || isBusinessTier) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-5"
                >
                  {/* Company Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {locale === 'en' ? 'Company Name' : 'Şirket / Ticari Unvan'}
                      {isBusinessTier && <span className="text-red-500"> *</span>}
                    </label>
                    <div className="relative">
                      <BuildingOfficeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={formData.companyName}
                        onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                        placeholder="ABC Ltd. Şti."
                        required={isBusinessTier}
                      />
                    </div>
                    {isBusinessTier && !formData.companyName && (
                      <p className="text-xs text-orange-600 mt-1.5 flex items-center gap-1">
                        ⚠️ {locale === 'en' ? 'Company name is required for business tier' : 'İşletme panelini kullanmak için şirket adı zorunludur'}
                      </p>
                    )}
                  </div>

                  {/* Tax Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {locale === 'en' ? 'Tax ID' : 'Vergi Kimlik No'}
                      </label>
                      <div className="relative">
                        <IdentificationIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          value={formData.taxId}
                          onChange={(e) => setFormData({ ...formData, taxId: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                          className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                          placeholder="1234567890"
                          maxLength={11}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {locale === 'en' ? 'Tax Office' : 'Vergi Dairesi'}
                      </label>
                      <input
                        type="text"
                        value={formData.taxOffice}
                        onChange={(e) => setFormData({ ...formData, taxOffice: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-all"
                        placeholder="Kadıköy VD"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                    <p className="text-sm text-blue-700">
                      ℹ️ {locale === 'en' 
                        ? 'Business information is used for invoicing. Incorrect information may result in legal liability.' 
                        : 'Kurumsal satıcı bilgileri fatura kesiminde kullanılır. Yanlış bilgi girişi yasal sorumluluk doğurabilir.'}
                    </p>
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition-colors"
            >
              {locale === 'en' ? 'Cancel' : 'İptal'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold rounded-xl transition-all shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
            </button>
          </div>

          {/* Settings Link */}
          <div className="text-center pt-4">
            <Link
              href="/profile/settings"
              className="text-sm text-gray-500 hover:text-orange-600 transition-colors"
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
