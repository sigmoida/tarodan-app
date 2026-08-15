/** @format */

"use client";

import { useRouter } from "@/i18n/navigation";
import { ClockIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useAuthStore } from "@/stores/authStore";
import StatusScreen from "../_components/StatusScreen";
import type { Translate } from "@/types/i18n";
import { useTranslations } from "next-intl";

const STEPS = (t: Translate) => [
  t("page.businessPending.page.ekibimizSirketBilgileriVeVergiKimlik"),
  t("page.businessPending.page.onaylandigindaHesabinizAktifOlurVeE"),
  t("page.businessPending.page.reddedilmesiDurumundaRedGerekcesiyleBirlikteE"),
];

export default function BusinessPendingPage() {
  const t = useTranslations();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <StatusScreen
      icon={ClockIcon}
      tone="warning"
      title={t("page.businessPending.page.basvurunuzInceleniyor")}
      description={t.rich("auth.businessPendingDescription", {
        company: user?.companyName ?? "",
        email: user?.email ?? "",
        b: (chunks) => (
          <span className="font-semibold text-heading">{chunks}</span>
        ),
      })}
    >
      <div className="mb-6 rounded-xl border border-warning-200 bg-warning-50 p-4 text-left">
        <p className="mb-2 text-sm font-semibold text-warning-700">
          {t("page.businessPending.page.onaySurecindeNelerOlur")}
        </p>
        <ol className="space-y-1.5 text-sm text-warning-700 list-decimal list-inside">
          {STEPS(t).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
      <div className="flex flex-col gap-3">
        {/* Tam başvuru akışı (şirket bilgileri + ortaklar + 7 belge) profil
            altındaki kurumsal sayfada — /seller/documents yalnız belge alt
            kümesini gösteriyordu. */}
        <ButtonLink href="/profile/business" className="w-full">
          {t("page.businessPending.page.basvuruyuTamamlaBelgeleriYukle")}
        </ButtonLink>
        <ButtonLink variant="secondary" href="/contact" className="w-full">
          {t("page.businessPending.page.destekEkibiyleIletisimeGec")}
        </ButtonLink>
        <Button variant="secondary" onClick={handleLogout}>
          {t("page.businessPending.page.cikisYap")}
        </Button>
      </div>
    </StatusScreen>
  );
}
