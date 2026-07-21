"use client";
import { useState } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Button } from "@tarodan/ui";
import { useAuthStore } from "@/stores/authStore";
import { GoogleIcon } from "./GoogleIcon";

/**
 * Tam-custom Google giriş butonu (tasarım sistemiyle uyumlu). Google'ın iframe
 * butonu yerine auth-code flow kullanır: GSI popup bir yetki `code`'u döndürür,
 * backend bunu Google ile takas edip id_token'ı doğrular. Böylece görünüm
 * tamamen @tarodan/ui Button'a ait olur.
 */
export function GoogleSignInButton({ onSuccess }: { onSuccess?: () => void }) {
  const t = useTranslations();
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const [isLoading, setIsLoading] = useState(false);

  const login = useGoogleLogin({
    flow: "auth-code",
    onSuccess: async ({ code }) => {
      try {
        await loginWithGoogle(code);
        onSuccess?.();
      } catch (e) {
        const err = e as { message?: string };
        toast.error(err?.message || t("auth.googleSignInFailed"));
      } finally {
        setIsLoading(false);
      }
    },
    onError: () => {
      setIsLoading(false);
      toast.error(t("auth.googleSignInFailed"));
    },
    onNonOAuthError: () => setIsLoading(false), // kullanıcı popup'ı kapattı
  });

  // Client ID yoksa butonu hiç gösterme (geliştirmede patlamasın).
  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      isLoading={isLoading}
      leftIcon={<GoogleIcon className="h-5 w-5" />}
      onClick={() => {
        setIsLoading(true);
        login();
      }}
    >
      {t("auth.continueWithGoogle")}
    </Button>
  );
}
