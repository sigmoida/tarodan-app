"use client";

import { useRouter } from "@/i18n/navigation";
import { UserIcon, UserPlusIcon } from "@heroicons/react/24/outline";
import { Button, Modal } from "@tarodan/ui";
import { useTranslations } from "next-intl";

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
  const t = useTranslations();

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
      title={title || t("auth.authRequired")}
      size="md"
      closeLabel={t("common.close")}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            leftIcon={<UserPlusIcon className="h-4 w-4" />}
            onClick={() => go("/register")}
          >
            {t("auth.freeSignUp")}
          </Button>
          <Button
            className="w-full sm:w-auto"
            leftIcon={<UserIcon className="h-4 w-4" />}
            onClick={() => go("/login")}
          >
            {t("common.login")}
          </Button>
        </div>
      }
    >
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
          {icon || <UserIcon className="h-8 w-8 text-primary-500" />}
        </div>

        <p className="text-sm text-muted">{message}</p>

        <p className="mt-5 text-xs text-muted">{t("auth.memberBenefits")}</p>
      </div>
    </Modal>
  );
}
