/** @format */

"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { SectionCard } from "@/components/ui";
import { PageShell } from "@/components/layout/PageShell";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { useAuthStore } from "@/stores/authStore";
import { useTranslations } from "next-intl";
import type { Translate } from "@/types/i18n";

const TIER_LABELS = (t: Translate): Record<string, string> => ({
  free: t("membership.success.ucretsiz"),
  basic: t("membership.success.temel"),
  premium: t("membership.success.premium"),
  business: t("membership.success.is"),
});

const CAN_DO = (t: Translate) => [
  t("membership.success.takasTeklifleriGonderinVeAlin"),
  t("membership.success.koleksiyonlarOlusturunVePaylasin"),
  t("membership.success.dahaFazlaIlanYayinlayin"),
  t("membership.success.oncelikliDestekAlin"),
];

export default function MembershipSuccessClient() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuthStore();

  // Soft guard: this page is only meaningful for a signed-in member who just
  // completed an upgrade. Anonymous visitors hitting the URL directly are sent
  // back to the plans. (Full protection would need a server-verified receipt.)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/membership");
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) return null;

  const scheduled = searchParams.get("scheduled") === "1";
  const kind = searchParams.get("kind");
  const tier = searchParams.get("tier") || "";
  const tierLabel = TIER_LABELS(t)[tier] || "yeni";
  const scheduledPeriod = searchParams.get("period");
  const periodLabel =
    scheduledPeriod === "yearly"
      ? t("membership.success.yillik")
      : t("membership.success.aylik");

  // Deferred downgrade: no payment, current plan lasts until period end.
  if (scheduled) {
    return (
      <PageShell className="flex items-center justify-center p-4">
        <SectionCard className="max-w-lg w-full p-8 md:p-10 text-center">
          <CheckCircleIcon className="mx-auto mb-6 h-14 w-14 text-warning-500" />
          <h1 className="mb-4 text-2xl md:text-3xl font-bold text-heading">
            {t("membership.success.planDegisikligiTalebinizAlindi")}
          </h1>
          <p className="mb-4 text-lg text-muted">
            {scheduledPeriod
              ? t.rich("membership.success.scheduledPeriodNotice", {
                  period: periodLabel,
                  b: (chunks) => (
                    <span className="font-semibold text-heading">{chunks}</span>
                  ),
                })
              : t.rich("membership.success.scheduledTierNotice", {
                  tier: tierLabel,
                  b: (chunks) => (
                    <span className="font-semibold text-heading">{chunks}</span>
                  ),
                })}
          </p>
          <p className="mb-8 text-muted">
            {t("membership.success.oTariheKadarMevcutUyelikAvantajlariniz")}
          </p>
          <div className="space-y-3">
            <ButtonLink variant="primary" href="/membership" className="w-full">
              {t("membership.success.uyelikSayfamaGit")}
            </ButtonLink>
            <ButtonLink variant="ghost" href="/profile" className="w-full">
              {t("membership.success.profileGit")}
            </ButtonLink>
          </div>
        </SectionCard>
      </PageShell>
    );
  }

  const headline =
    kind === "upgrade"
      ? t("membership.success.uyeliginizBasariylaYukseltildi")
      : t("membership.success.uyeliginizBasariylaDegistirildi");

  return (
    <PageShell className="flex items-center justify-center p-4">
      <SectionCard className="max-w-lg w-full p-8 md:p-10 text-center">
        <CheckCircleIcon className="mx-auto mb-6 h-14 w-14 text-success-500" />
        <h1 className="mb-3 text-2xl md:text-3xl font-bold text-heading">
          {t("membership.success.tebrikler")}
        </h1>
        <p className="mb-8 text-lg text-muted">{headline}</p>

        <div className="mb-8 rounded-lg bg-surface p-6 text-left">
          <h2 className="mb-4 font-semibold text-heading">
            {t("membership.success.artikSunlariYapabilirsiniz")}
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-muted marker:text-success-500">
            {CAN_DO(t).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <ButtonLink variant="primary" href="/listings/new" className="w-full">
            {t("membership.success.yeniIlanOlustur")}
          </ButtonLink>
          <ButtonLink
            variant="secondary"
            href="/collections"
            className="w-full"
          >
            {t("membership.success.koleksiyonOlustur")}
          </ButtonLink>
          <ButtonLink variant="ghost" href="/profile" className="w-full">
            {t("membership.success.profileGit")}
          </ButtonLink>
        </div>
      </SectionCard>
    </PageShell>
  );
}
