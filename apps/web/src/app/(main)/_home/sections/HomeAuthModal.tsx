"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { withChunkErrorLogging } from "@/lib/dynamicWithLogging";
import { useTranslation } from "@/i18n/LanguageContext";

const AuthRequiredModal = dynamic(
  withChunkErrorLogging(
    () => import("@/components/AuthRequiredModal"),
    "AuthRequiredModal",
  ),
  { ssr: false },
);

export default function HomeAuthModal() {
  const { t } = useTranslation();
  // NOTE: the trigger (setShowAuthModal(true) / setAuthModalConfig) is currently
  // dead code — nothing on the home page opens this modal — but the modal and its
  // state are preserved intentionally.
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalConfig] = useState({
    title: t("auth.authRequired"),
    message: t("auth.authRequiredMessage"),
    icon: null as React.ReactNode | null,
    redirectPath: undefined as string | undefined,
  });

  return (
    <AuthRequiredModal
      isOpen={showAuthModal}
      onClose={() => setShowAuthModal(false)}
      title={authModalConfig.title}
      message={authModalConfig.message}
      icon={authModalConfig.icon}
      redirectPath={authModalConfig.redirectPath}
    />
  );
}
