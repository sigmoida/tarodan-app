"use client";

import { useRouter } from "next/navigation";
import { UserIcon, UserPlusIcon } from "@heroicons/react/24/outline";
import { Button, Modal } from "@tarodan/ui";
import { useTranslation } from "@/i18n/LanguageContext";

interface AuthRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  icon?: React.ReactNode;
  redirectPath?: string;
}

export default function AuthRequiredModal({
  isOpen,
  onClose,
  title,
  message,
  icon,
  redirectPath,
}: AuthRequiredModalProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const go = (base: string) => {
    onClose();
    const currentPath =
      redirectPath || window.location.pathname + window.location.search;
    router.push(`${base}?redirect=${encodeURIComponent(currentPath)}`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-md"
      zIndex="z-[200]"
    >
      <div className="pt-2 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
          {icon || <UserIcon className="h-8 w-8 text-primary-500" />}
        </div>

        <h2 className="mb-2 text-xl font-bold text-heading">
          {title || t("auth.authRequired")}
        </h2>
        <p className="mb-6 text-sm text-muted">{message}</p>

        <div className="space-y-2.5">
          <Button
            className="w-full"
            leftIcon={<UserIcon className="h-4 w-4" />}
            onClick={() => go("/login")}
          >
            {t("common.login")}
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            leftIcon={<UserPlusIcon className="h-4 w-4" />}
            onClick={() => go("/register")}
          >
            {t("auth.freeSignUp")}
          </Button>
        </div>

        <p className="mt-5 text-xs text-muted">{t("auth.memberBenefits")}</p>
      </div>
    </Modal>
  );
}
