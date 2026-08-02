"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useAuthStore } from "@/stores/authStore";

export default function BusinessMembershipGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const isBusinessAccount = !!(user.companyName && user.taxId);
    if (!isBusinessAccount) return;

    // Pending: sadece /business-pending ve /contact'a izin ver
    if (user.businessStatus === "pending") {
      const allowedPaths = ["/business-pending", "/contact"];
      if (!allowedPaths.some((p) => pathname.startsWith(p))) {
        router.replace("/business-pending");
      }
      return;
    }

    // Rejected: sadece /business-rejected ve /contact'a izin ver
    if (user.businessStatus === "rejected") {
      const allowedPaths = ["/business-rejected", "/contact", "/login"];
      if (!allowedPaths.some((p) => pathname.startsWith(p))) {
        router.replace("/business-rejected");
      }
      return;
    }

    // Üyelik zorunluluğu YALNIZ onaylı kurumsal hesaba uygulanır. businessStatus
    // yokken companyName+taxId dolu bir hesap (eski self-declare kalıntısı) bu
    // dala düşerse /membership döngüsüne kilitleniyordu: Business tier satın
    // alması da onaysız olduğu için 403 ile reddediliyordu.
    if (user.businessStatus !== "approved") return;

    // Approved ama business üyeliği yoksa üyelik sayfasına yönlendir
    const isBusinessTier = user.membershipTier === "business";
    const allowedPaths = ["/membership"];
    if (!isBusinessTier && !allowedPaths.some((p) => pathname.startsWith(p))) {
      router.push("/membership?required=true");
    }
  }, [isAuthenticated, user, pathname, router]);

  return <>{children}</>;
}
