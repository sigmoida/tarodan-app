/** @format */

import {
  ShieldCheckIcon,
  TruckIcon,
  ArrowPathIcon,
  CreditCardIcon,
  RectangleStackIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import type { Translate } from "@/types/i18n";
import { getTranslations } from "next-intl/server";

const TRUST_BADGES = (t: Translate) => ({
  tr: [
    {
      label: t("page.sections.trustbadges.guvenliAlisveris"),
      description: t("page.sections.trustbadges.sslSertifikaliGuvenliOdeme"),
      icon: ShieldCheckIcon,
    },
    {
      label: t("page.sections.trustbadges.guvenliKargo"),
      description: t("page.sections.trustbadges.hizliTakipImkaniyla"),
      icon: TruckIcon,
    },
    {
      label: t("page.sections.trustbadges.iadeImkani"),
      description: t("page.sections.trustbadges.14GunKosulsuzIade"),
      icon: ArrowPathIcon,
    },
    {
      label: t("page.sections.trustbadges.taksitImkani"),
      description: t("page.sections.trustbadges.12AyaVaranTaksit"),
      icon: CreditCardIcon,
    },
    {
      label: t("page.sections.trustbadges.koleksiyonSergile"),
      description: t("page.sections.trustbadges.dijitalGarajiniOlustur"),
      icon: RectangleStackIcon,
    },
    {
      label: t("page.sections.trustbadges.guvenliTakas"),
      description: t("page.sections.trustbadges.guvenliTakasSistemi"),
      icon: ArrowsRightLeftIcon,
    },
  ],
  en: [
    {
      label: t("page.sections.trustbadges.secureShopping"),
      description: t("page.sections.trustbadges.sslCertifiedSecurePayment"),
      icon: ShieldCheckIcon,
    },
    {
      label: t("page.sections.trustbadges.secureShipping"),
      description: t("page.sections.trustbadges.withFastTracking"),
      icon: TruckIcon,
    },
    {
      label: t("page.sections.trustbadges.easyReturns"),
      description: t("page.sections.trustbadges.14DaysUnconditionalReturn"),
      icon: ArrowPathIcon,
    },
    {
      label: t("page.sections.trustbadges.installments"),
      description: t("page.sections.trustbadges.upTo12MonthInstallments"),
      icon: CreditCardIcon,
    },
    {
      label: t("page.sections.trustbadges.displayCollection"),
      description: t("page.sections.trustbadges.createYourDigitalGarage"),
      icon: RectangleStackIcon,
    },
    {
      label: t("page.sections.trustbadges.safeTrading"),
      description: t("page.sections.trustbadges.secureTradingSystem"),
      icon: ArrowsRightLeftIcon,
    },
  ],
});

export default async function TrustBadges({ locale }: { locale: string }) {
  const t = await getTranslations();
  const badges = TRUST_BADGES(t)[locale as "tr" | "en"];

  return (
    <section className=" bg-surface">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
        {badges.map((badge) => {
          const Icon = badge.icon;
          return (
            <div
              key={badge.label}
              className="flex flex-col items-center text-center px-2 py-3 bg-surface-elevated border border-border-subtle rounded"
            >
              <Icon className="w-5 h-5 text-primary-500 mb-1.5" />
              <p className="text-2xs sm:text-xs font-semibold text-heading leading-tight">
                {badge.label}
              </p>
              <p className="text-2xs sm:text-2xs text-muted mt-0.5 hidden md:block">
                {badge.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
