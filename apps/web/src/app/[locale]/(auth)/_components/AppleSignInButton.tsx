"use client";
import { useCallback, useState } from "react";
import Script from "next/script";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Button } from "@tarodan/ui";
import { useAuthStore } from "@/stores/authStore";
import { AppleIcon } from "./AppleIcon";

const SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID;
const REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;
const APPLE_JS =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

declare global {
  interface Window {
    AppleID?: any;
  }
}

/**
 * Apple giriş butonu — GoogleSignInButton'ın simetriği, aynı `@tarodan/ui`
 * Button'ı kullanır (Apple'ın hazır butonu yerine) ki ikisi yan yana aynı
 * ölçüde dursun.
 *
 * Popup akışı: Apple'ın JS SDK'sı bir `id_token` döndürür, BFF onu API'ye
 * iletir, API JWKS ile doğrular. Redirect yok, bu yüzden callback route'u da
 * yok — ancak Apple `redirectURI`'yi konsolda kayıtlı Return URL'lerle
 * karşılaştırdığı için değer birebir eşleşmeli.
 */
export function AppleSignInButton({ onSuccess }: { onSuccess?: () => void }) {
  const t = useTranslations();
  const loginWithApple = useAuthStore((s) => s.loginWithApple);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (typeof window === "undefined" || !window.AppleID) {
      toast.error(t("auth.appleScriptFailed"));
      return;
    }
    setIsLoading(true);
    try {
      window.AppleID.auth.init({
        clientId: SERVICES_ID,
        redirectURI: REDIRECT_URI,
        scope: "name email",
        usePopup: true,
      });
      const data = await window.AppleID.auth.signIn();
      const idToken = data?.authorization?.id_token;
      if (!idToken) {
        toast.error(t("auth.appleSignInFailed"));
        return;
      }
      // Apple adı YALNIZCA ilk yetkilendirmede döndürür; sonraki girişlerde
      // gelmez, o yüzden opsiyonel.
      const name = data?.user?.name;
      const fullName = name
        ? [name.firstName, name.lastName].filter(Boolean).join(" ") || undefined
        : undefined;
      await loginWithApple(idToken, fullName);
      onSuccess?.();
    } catch (e: any) {
      // Kullanıcı popup'ı kapattı → sessiz geç.
      if (e?.error === "popup_closed_by_user") return;
      toast.error(e?.message || t("auth.appleSignInFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [loginWithApple, onSuccess, t]);

  // Servis ID / redirect yoksa butonu hiç gösterme (geliştirmede patlamasın).
  if (!SERVICES_ID || !REDIRECT_URI) return null;

  return (
    <>
      <Script src={APPLE_JS} strategy="afterInteractive" />
      <Button
        type="button"
        variant="outline"
        className="w-full"
        isLoading={isLoading}
        leftIcon={<AppleIcon className="h-4 w-4" />}
        onClick={handleClick}
      >
        {t("auth.continueWithApple")}
      </Button>
    </>
  );
}
