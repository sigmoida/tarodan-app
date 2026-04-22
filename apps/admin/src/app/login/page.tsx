"use client";

import { useState, useEffect } from "react";

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
    setUser,
    setToken,
    isAuthenticated,
    isLoading: isAuthLoading,
  } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isAuthLoading, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
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
        const accessToken = response.data.tokens.accessToken;
        setToken(accessToken);
        setUser(response.data.user);
        if (typeof window !== "undefined") {
          localStorage.setItem("admin_token", accessToken);
          localStorage.setItem(
            "admin_user",
            JSON.stringify(response.data.user),
          );
          const maxAge = 24 * 60 * 60;
          document.cookie = `admin_token=${accessToken}; path=/; max-age=${maxAge}; SameSite=Lax`;

          toast.success("Giriş başarılı!");

          window.location.href = "/dashboard";
        }
      } else {
        toast.error("Geçersiz yanıt formatı");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Giriş başarısız");
    } finally {
      setIsLoading(false);
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

        {/* Login Card */}
        <div className="bg-surface-elevated rounded-xl shadow-elevated p-8 border border-border">
          <h2 className="text-2xl font-semibold text-heading mb-6">
            Giriş Yap
          </h2>

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
              <label className="block text-sm font-medium text-body mb-2">
                Şifre
              </label>
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
        </div>

        {/* Footer */}
        <p className="text-center text-muted text-sm mt-6">
          © 2026 Tarodan Marketplace. Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  );
}
