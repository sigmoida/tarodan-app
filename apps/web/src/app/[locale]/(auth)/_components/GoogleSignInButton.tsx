"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Button } from "@tarodan/ui";
import { useAuthStore } from "@/stores/authStore";
import { GoogleIcon } from "@/components/auth/GoogleIcon";
import {
  GoogleAuthCodeError,
  useGoogleAuthCode,
} from "@/components/auth/useGoogleAuthCode";

/**
 * A fully custom Google sign-in button (on the design system's `Button`
 * instead of Google's iframe button). The credential step is the shared
 * `useGoogleAuthCode` popup; this button only signs in with the code.
 */
export function GoogleSignInButton({ onSuccess }: { onSuccess?: () => void }) {
  const t = useTranslations();
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const { isAvailable, requestCode } = useGoogleAuthCode();
  const [isLoading, setIsLoading] = useState(false);

  // No client id (local development): show no button rather than a broken one.
  if (!isAvailable) return null;

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const code = await requestCode();
      if (!code) return; // popup closed
      await loginWithGoogle(code);
      onSuccess?.();
    } catch (e) {
      const message = (e as { message?: string })?.message;
      toast.error(
        e instanceof GoogleAuthCodeError || !message
          ? t("auth.googleSignInFailed")
          : message,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      isLoading={isLoading}
      leftIcon={<GoogleIcon className="h-4 w-4" />}
      onClick={handleClick}
    >
      {t("auth.continueWithGoogle")}
    </Button>
  );
}
