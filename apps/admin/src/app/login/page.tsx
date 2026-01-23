'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/lib/stores/authStore';
import { api } from '@/lib/api';

interface LoginForm {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { setUser, setToken } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const response = await api.post('/auth/admin/login', {
        email: data.email,
        password: data.password,
        ...(requires2FA && { twoFactorCode: data.twoFactorCode }),
      });

      if (response.data.requires2FA) {
        setRequires2FA(true);
        toast.success('İki faktörlü doğrulama kodu gerekli');
        return;
      }

      // API returns { user, tokens: { accessToken, refreshToken } }
      if (response.data.tokens?.accessToken) {
        setToken(response.data.tokens.accessToken);
        setUser(response.data.user);
        // Store token in localStorage for API interceptor
        if (typeof window !== 'undefined') {
          localStorage.setItem('admin_token', response.data.tokens.accessToken);
          localStorage.setItem('admin_user', JSON.stringify(response.data.user));
        }
        toast.success('Giriş başarılı!');
        router.push('/dashboard');
      } else {
        toast.error('Geçersiz yanıt formatı');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Giriş başarısız');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src="/tarodan-logo.jpg"
            alt="Tarodan Logo"
            width={200}
            height={65}
            className="mx-auto object-contain"
            priority
          />
          <p className="text-gray-400 mt-2">Admin Panel</p>
        </div>

        {/* Login Card */}
        <div className="bg-dark-800 rounded-xl shadow-2xl p-8 border border-dark-700">
          <h2 className="text-2xl font-semibold text-white mb-6">Giriş Yap</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                E-posta
              </label>
              <input
                type="email"
                {...register('email', {
                  required: 'E-posta gerekli',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Geçerli bir e-posta girin',
                  },
                })}
                className="admin-input"
                placeholder="admin@tarodan.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-400">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Şifre
              </label>
              <input
                type="password"
                {...register('password', {
                  required: 'Şifre gerekli',
                  minLength: {
                    value: 6,
                    message: 'Şifre en az 6 karakter olmalı',
                  },
                })}
                className="admin-input"
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>
              )}
            </div>

            {/* 2FA Code */}
            {requires2FA && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Doğrulama Kodu
                </label>
                <input
                  type="text"
                  {...register('twoFactorCode', {
                    required: requires2FA ? 'Doğrulama kodu gerekli' : false,
                    pattern: {
                      value: /^\d{6}$/,
                      message: '6 haneli kod girin',
                    },
                  })}
                  className="admin-input"
                  placeholder="000000"
                  maxLength={6}
                />
                {errors.twoFactorCode && (
                  <p className="mt-1 text-sm text-red-400">
                    {errors.twoFactorCode.message}
                  </p>
                )}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Giriş yapılıyor...
                </span>
              ) : (
                'Giriş Yap'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm mt-6">
          © 2024 Tarodan Marketplace. Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  );
}
