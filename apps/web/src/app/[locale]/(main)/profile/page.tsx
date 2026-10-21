/** @format */

import type { Metadata } from "next";
import MembershipSummary from "./_sections/MembershipSummary";
import ProfileInfoSection from "./_sections/ProfileInfoSection";
import LegalIdentitySection from "./_sections/LegalIdentitySection";
import AddressesSection from "./_sections/AddressesSection";
import BankAccountSection from "./_sections/BankAccountSection";
import SecuritySection from "./_sections/SecuritySection";
import ConnectedAccountsSection from "./_sections/ConnectedAccountsSection";
import NotificationsSection from "./_sections/NotificationsSection";
import DangerZoneSection from "./_sections/DangerZoneSection";
import LanguagePreferenceSection from "./_sections/LanguagePreferenceSection";
import ReauthProvider from "./_context/ReauthProvider";
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
 * shared ProfileContext provided by the layout). `ReauthProvider` gives the
 * sensitive writes (password, connected accounts, e-mail change, deletion) one
 * shared step-up dialog and in-memory token.
 */
export default function ProfilePage() {
  return (
    <ReauthProvider>
      <div className="space-y-6 pb-16">
        <MembershipSummary />
        <ProfileInfoSection />
        <LegalIdentitySection />
        <LanguagePreferenceSection />
        <AddressesSection />
        <BankAccountSection />
        <SecuritySection />
        <ConnectedAccountsSection />
        <NotificationsSection />
        <DangerZoneSection />
      </div>
    </ReauthProvider>
  );
}
