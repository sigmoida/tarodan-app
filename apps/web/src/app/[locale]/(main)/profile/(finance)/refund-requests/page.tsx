"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { ReceiptPercentIcon } from "@heroicons/react/24/outline";
import { EmptyState, Spinner } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/stores/authStore";
import { useTranslations } from "next-intl";
import { useRefundRequests } from "./_hooks/useRefundRequests";
import RefundRequestCard from "./_components/RefundRequestCard";

export default function MyRefundRequestsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const t = useTranslations();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login?redirect=/profile/refund-requests");
    }
  }, [authLoading, isAuthenticated, router]);

  const { requests, isLoading } = useRefundRequests(isAuthenticated);

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title={t("order.myRefundRequests")}
        description={t("refund.listDesc")}
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<ReceiptPercentIcon className="h-7 w-7" />}
          title={t("refund.listEmpty")}
        />
      ) : (
        <div className="space-y-3">
          {requests.map((rr) => (
            <RefundRequestCard key={rr.id} request={rr} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
