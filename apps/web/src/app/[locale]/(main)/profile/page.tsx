/** @format */

import type { Metadata } from "next";
import MembershipSummary from "./_sections/MembershipSummary";
import ProfileInfoSection from "./_sections/ProfileInfoSection";
import AddressesSection from "./_sections/AddressesSection";
import BankAccountSection from "./_sections/BankAccountSection";
import SecuritySection from "./_sections/SecuritySection";
import NotificationsSection from "./_sections/NotificationsSection";
import DangerZoneSection from "./_sections/DangerZoneSection";
import LanguagePreferenceSection from "./_sections/LanguagePreferenceSection";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return {
    title: t("page.profile.page.profilimTarodan"),
    description: t(
      "page.profile.page.hesabiniziIlanlariniziUyeliginiziVeAyarlariniziYonetin",
    ),
    robots: { index: false, follow: false },
  };
}

/**
 * Profile dashboard — a thin Server Component shell. Each section below is an
 * independent Client island that owns its own TanStack Query fetch + form, so
 * they render and refresh independently (the account overview card reads the
 * shared ProfileContext provided by the layout).
 */
export default function ProfilePage() {
  return (
    <div className="space-y-6 pb-16">
      <MembershipSummary />
      <ProfileInfoSection />
      <LanguagePreferenceSection />
      <AddressesSection />
      <BankAccountSection />
      <SecuritySection />
      <NotificationsSection />
      <DangerZoneSection />
    </div>
  );
}
