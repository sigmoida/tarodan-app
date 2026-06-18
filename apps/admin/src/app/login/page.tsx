"use client";

import { useState, useEffect, type FormEvent } from "react";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/stores/authStore";
import { api } from "@/lib/api";
import { Button, Input } from "@tarodan/ui";

interface LoginForm {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export default function LoginPage() {
  const router = useRouter();
  const {
    user,
    setUser,
    isAuthenticated,
    isLoading: isAuthLoading,
  } = useAuthStore();

  // Rol bazlı açılış sayfası: moderatör dashboard/finans göremez → ürünlere düş.
  const landingFor = (role?: string) =>
    role === "moderator" ? "/products" : "/dashboard";
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Şifremi unuttum görünümü
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      router.replace(landingFor(user?.role));
    }
  }, [isAuthenticated, isAuthLoading, router, user?.role]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setLoginError(null);
    try {
      const response = await api.post("/auth/admin/login", {
        email: data.email,
        password: data.password,
        ...(requires2FA && { twoFactorCode: data.twoFactorCode }),
      });

      if (response.data.requires2FA) {
        setRequires2FA(true);
        toast.success("İki faktörlü doğrulama kodu gerekli");
        return;
      }

      if (response.data.tokens?.accessToken) {
        // Token'lar httpOnly cookie olarak backend tarafından set edildi; JS'te saklamıyoruz.
        setUser(response.data.user);
        toast.success("Giriş başarılı!");
        if (typeof window !== "undefined") {
          window.location.href = landingFor(response.data.user?.role);
        }
      } else {
        setLoginError("Geçersiz yanıt formatı");
      }
    } catch (error: any) {
      const status = error.response?.status;
      // Hatalı kimlik bilgisi (401/400) → net mesaj. 2FA kodu hatalıysa da kimlik doğrulanamaz.
      const message =
        status === 401 || status === 400
          ? requires2FA
            ? "Doğrulama kodu hatalı"
            : "E-posta veya şifre hatalı girildi"
          : error.response?.data?.message || "Giriş başarısız";
      // Toast YOK — hata zaten form üstündeki kırmızı banner'da kalıcı gösteriliyor.
      setLoginError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const onForgotSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: forgotEmail });
    } catch {
      // E-postanın kayıtlı olup olmadığını sızdırmamak için hata da olsa aynı mesajı gösteririz.
    } finally {
      setForgotLoading(false);
      setForgotSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface via-surface-elevated to-surface-alt px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src="/tarodan-logo.jpg"
            alt="Tarodan Logo"
            width={200}
            height={65}
            className="mx-auto object-contain"
            style={{
              width: "auto",
              height: "auto",
              maxWidth: "100%",
              maxHeight: "65px",
            }}
            priority
          />
          <p className="text-muted mt-2">Admin Panel</p>
        </div>

        {/* Card */}
        <div className="bg-surface-elevated rounded-xl shadow-elevated p-8 border border-border">
          {forgotMode ? (
            /* ───────────── Şifremi Unuttum ───────────── */
            <>
              <h2 className="text-2xl font-semibold text-heading mb-6">
                Şifremi Unuttum
              </h2>

              {forgotSent ? (
                <div className="space-y-6">
                  <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-700">
                    Eğer <strong>{forgotEmail}</strong> sistemde kayıtlıysa, şifre
                    sıfırlama bağlantısı e-posta adresine gönderildi. Gelen
                    kutunu (ve spam klasörünü) kontrol et.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(false);
                      setForgotSent(false);
                    }}
                    className="w-full text-center text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    ← Girişe dön
                  </button>
                </div>
              ) : (
                <form onSubmit={onForgotSubmit} className="space-y-6">
                  <p className="text-sm text-muted">
                    Hesabının e-posta adresini gir; sana şifre sıfırlama
                    bağlantısı gönderelim.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-body mb-2">
                      E-posta
                    </label>
                    <Input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="admin@tarodan.com"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full py-3 text-lg"
                  >
                    {forgotLoading
                      ? "Gönderiliyor..."
                      : "Sıfırlama bağlantısı gönder"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setForgotMode(false)}
                    className="w-full text-center text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    ← Girişe dön
                  </button>
                </form>
              )}
            </>
          ) : (
            /* ───────────── Giriş ───────────── */
            <>
              <h2 className="text-2xl font-semibold text-heading mb-6">
                Giriş Yap
              </h2>

              {/* Genel hata uyarısı */}
              {loginError && (
                <div
                  role="alert"
                  className="mb-6 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700"
                >
                  {loginError}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-body mb-2">
                    E-posta
                  </label>
                  <Input
                    type="email"
                    {...register("email", {
                      required: "E-posta gerekli",
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: "Geçerli bir e-posta girin",
                      },
                    })}
                    placeholder="admin@tarodan.com"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-danger-600">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-body">
                      Şifre
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotMode(true);
                        setForgotSent(false);
                        setLoginError(null);
                      }}
                      className="text-sm font-medium text-primary-600 hover:text-primary-700"
                    >
                      Şifremi unuttum?
                    </button>
                  </div>
                  {/* Göz aç/kapa artık Input component'inde dahili (type="password" → otomatik). */}
                  <Input
                    type="password"
                    {...register("password", {
                      required: "Şifre gerekli",
                      minLength: {
                        value: 6,
                        message: "Şifre en az 6 karakter olmalı",
                      },
                    })}
                    placeholder="••••••••"
                  />
                  {errors.password && (
                    <p className="mt-1 text-sm text-danger-600">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                {/* 2FA Code */}
                {requires2FA && (
                  <div>
                    <label className="block text-sm font-medium text-body mb-2">
                      Doğrulama Kodu
                    </label>
                    <Input
                      type="text"
                      {...register("twoFactorCode", {
                        required: requires2FA ? "Doğrulama kodu gerekli" : false,
                        pattern: {
                          value: /^\d{6}$/,
                          message: "6 haneli kod girin",
                        },
                      })}
                      placeholder="000000"
                      maxLength={6}
                    />
                    {errors.twoFactorCode && (
                      <p className="mt-1 text-sm text-danger-600">
                        {errors.twoFactorCode.message}
                      </p>
                    )}
                  </div>
                )}

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 text-lg"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-inverted"
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
                    "Giriş Yap"
                  )}
                </Button>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-muted text-sm mt-6">
          © 2026 Tarodan Marketplace. Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  );
}
