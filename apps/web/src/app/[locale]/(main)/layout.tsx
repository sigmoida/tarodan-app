/** @format */

import QueryProvider from "@/components/QueryProvider";
import { RealtimeProvider } from "@/components/realtime/RealtimeProvider";
import { PlatformFeeAnnouncementBanner } from "@/components/banners/PlatformFeeAnnouncementBanner";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import BusinessMembershipGuard from "@/components/BusinessMembershipGuard";
import SellerAddressPrompt from "@/components/SellerAddressPrompt";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { Container } from "@/components/layout/Container";
import PreferredLanguageSync from "@/components/PreferredLanguageSync";

/**
 * Layout for the public marketplace. Owns the storefront chrome (Navbar +
 * category bar + Footer) and the client providers those routes need
 * (query / realtime / confirm / business-membership gating + the platform-fee
 * banner). Auth pages and standalone status pages live outside this group and
 * so render without any of it. Replaces the old runtime `LayoutShell` path check.
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <PreferredLanguageSync />
      <RealtimeProvider />
      <PlatformFeeAnnouncementBanner />
      <ConfirmProvider>
        <BusinessMembershipGuard>
          <SellerAddressPrompt />
          <Header />
          <main className="flex-1 w-full py-4">
            <Container>{children}</Container>
          </main>
          <Footer />
        </BusinessMembershipGuard>
      </ConfirmProvider>
    </QueryProvider>
  );
}
