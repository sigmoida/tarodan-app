"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Button } from "@tarodan/ui";
import { useAuthStore } from "@/stores/authStore";
import { AppleIcon } from "@/components/auth/AppleIcon";
import { AppleSdkScript } from "@/components/auth/AppleSdkScript";
import {
  AppleCredentialError,
  useAppleCredential,
} from "@/components/auth/useAppleCredential";

/**
 * The Apple sign-in button: the twin of GoogleSignInButton on the same
 * `@tarodan/ui` Button (instead of Apple's ready-made one), so both sit side by
 * side at the same size. The credential step is the shared
 * `useAppleCredential` popup; this button only signs in with it.
 */
export function AppleSignInButton({ onSuccess }: { onSuccess?: () => void }) {
  const t = useTranslations();
  const loginWithApple = useAuthStore((s) => s.loginWithApple);
  const { isAvailable, requestCredential } = useAppleCredential();
  const [isLoading, setIsLoading] = useState(false);

  // No Services ID or return URL (local development): show no button.
  if (!isAvailable) return null;

  const handleClick = async () => {
    setIsLoading(true);
    try {
      const credential = await requestCredential();
      if (!credential) return; // popup closed
      await loginWithApple(credential.identityToken, credential.fullName);
      onSuccess?.();
    } catch (e) {
      if (e instanceof AppleCredentialError) {
        toast.error(
          e.reason === "script"
            ? t("auth.appleScriptFailed")
            : t("auth.appleSignInFailed"),
        );
        return;
      }
      toast.error(
        (e as { message?: string })?.message || t("auth.appleSignInFailed"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <AppleSdkScript />
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
