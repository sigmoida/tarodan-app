/** @format */

"use client";

import { useRouter } from "@/i18n/navigation";
import { XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useAuthStore } from "@/stores/authStore";
import StatusScreen from "../_components/StatusScreen";
import { useTranslations } from "next-intl";

export default function BusinessRejectedPage() {
  const t = useTranslations();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <StatusScreen
      icon={XCircleIcon}
      tone="danger"
      title={t("page.businessRejected.page.basvurunuzReddedildi")}
      description={t.rich("auth.businessRejectedDescription", {
        company: user?.companyName ?? "",
        email: user?.email ?? "",
        b: (chunks) => (
          <span className="font-semibold text-heading">{chunks}</span>
        ),
      })}
    >
      <div className="mb-6 rounded-xl border border-danger-200 bg-danger-50 p-4 text-left">
        <p className="text-sm text-danger-700">
          {t(
            "page.businessRejected.page.basvurunuzunHataliReddedildiginiVeyaEksikBilgi",
          )}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <ButtonLink href="/contact" className="w-full">
          {t("page.businessRejected.page.destekEkibiyleIletisimeGec")}
        </ButtonLink>
        <Button variant="secondary" onClick={handleLogout}>
          {t("page.businessRejected.page.cikisYap")}
        </Button>
      </div>
    </StatusScreen>
  );
}
