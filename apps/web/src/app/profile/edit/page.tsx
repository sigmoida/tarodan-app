'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export default function EditProfilePage() {
  const router = useRouter();
  const { isAuthenticated, user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);
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
      setFormData({
        displayName: user.displayName || '',
        email: user.email || '',
        phone: user.phone || '',
        birthDate: (user as any).birthDate ? new Date((user as any).birthDate).toISOString().split('T')[0] : '',
        bio: (user as any).bio || '',
        isCorporateSeller: (user as any).isCorporateSeller || false,
        companyName: (user as any).companyName || '',
        taxId: (user as any).taxId || '',
        taxOffice: (user as any).taxOffice || '',
      });
    }
  }, [isAuthenticated, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await api.patch('/users/me', formData);
      const updatedUser = response.data.user || response.data;
      setUser(updatedUser);
      toast.success('Profil güncellendi');
      router.push('/profile');
    } catch (error: any) {
      console.error('Profile update error:', error);
      toast.error(error.response?.data?.message || 'Profil güncellenemedi');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <main className="max-w-2xl mx-auto px-4 py-8">
        <Link
          href="/profile"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-8"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          Profile Dön
        </Link>

        <div className="bg-gray-800 rounded-xl p-6">
          <h1 className="text-2xl font-bold mb-6">Profili Düzenle</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Görünen İsim
              </label>
              <input
                type="text"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                E-posta
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50"
                disabled
                title="E-posta adresini değiştirmek için destek ile iletişime geçin"
              />
              <p className="text-xs text-gray-400 mt-1">E-posta değişikliği için destek ile iletişime geçin</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Telefon
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="+90 555 123 4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Doğum Tarihi
                </label>
                <input
                  type="date"
                  value={formData.birthDate}
                  onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
                  max={new Date(new Date().setFullYear(new Date().getFullYear() - 13)).toISOString().split('T')[0]}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Hakkımda
              </label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                rows={4}
                placeholder="Kendiniz hakkında kısa bir bilgi..."
                maxLength={500}
              />
            </div>

            {/* Corporate Seller Section */}
            <div className="border-t border-gray-600 pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Kurumsal Satıcı</h3>
                  <p className="text-sm text-gray-400">Şirket adına satış yapıyorsanız aktifleştirin</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isCorporateSeller: !formData.isCorporateSeller })}
                  className={`relative w-14 h-8 rounded-full transition-colors ${
                    formData.isCorporateSeller ? 'bg-primary-500' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                      formData.isCorporateSeller ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {formData.isCorporateSeller && (
                <div className="space-y-4 p-4 bg-gray-700/50 rounded-lg">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Şirket / Ticari Unvan
                    </label>
                    <input
                      type="text"
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                      placeholder="ABC Ltd. Şti."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Vergi Kimlik No
                      </label>
                      <input
                        type="text"
                        value={formData.taxId}
                        onChange={(e) => setFormData({ ...formData, taxId: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        placeholder="1234567890"
                        maxLength={11}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Vergi Dairesi
                      </label>
                      <input
                        type="text"
                        value={formData.taxOffice}
                        onChange={(e) => setFormData({ ...formData, taxOffice: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                        placeholder="Kadıköy VD"
                      />
                    </div>
                  </div>

                  <p className="text-xs text-gray-400">
                    ℹ️ Kurumsal satıcı bilgileri fatura kesiminde kullanılır. 
                    Yanlış bilgi girişi yasal sorumluluk doğurabilir.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              >
                İptal
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-primary-500 hover:bg-primary-600 rounded-lg transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                {loading ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
