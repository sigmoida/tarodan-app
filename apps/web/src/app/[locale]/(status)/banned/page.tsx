"use client";

import { Suspense } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { NoSymbolIcon } from "@heroicons/react/24/solid";
import { Button } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useAuthStore } from "@/stores/authStore";
import StatusScreen from "../_components/StatusScreen";
import { useTranslations } from "next-intl";

function BannedContent() {
  const t = useTranslations();
  const router = useRouter();
  const reason = useSearchParams().get("reason");
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <StatusScreen
      icon={NoSymbolIcon}
      tone="danger"
      title={t("page.banned.page.hesabinizAskiyaAlindi")}
      description={t(
        "page.banned.page.hesabinizKuralIhlaliNedeniyleBanlanmistirBunun",
      )}
    >
      {reason && (
        <div className="mb-6 rounded-xl border border-danger-200 bg-danger-50 p-4 text-left">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger-600">
            {t("page.banned.page.banSebebi")}
          </p>
          <p className="text-sm text-heading">{reason}</p>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <ButtonLink variant="primary" href="/contact" className="w-full">
          {t("page.banned.page.destekEkibiyleIletisimeGec")}
        </ButtonLink>
        <Button variant="secondary" onClick={handleLogout} className="w-full">
          {t("page.banned.page.cikisYap")}
        </Button>
      </div>
    </StatusScreen>
  );
}

export default function BannedPage() {
  return (
    <Suspense>
      <BannedContent />
    </Suspense>
  );
}
