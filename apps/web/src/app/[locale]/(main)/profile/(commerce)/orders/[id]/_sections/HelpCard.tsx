/** @format */

"use client";

import Link from "next/link";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";

export default function HelpCard({ orderId }: { orderId: string }) {
  const t = useTranslations();

  return (
    <SectionCard title={t("nav.help")}>
      <div className="space-y-2">
        <Link
          href={`/support?orderId=${orderId}`}
          className="block w-full text-left px-4 py-2 text-muted hover:bg-surface rounded-lg transition-colors"
        >
          {t("order.reportIssue")}
        </Link>
        <Link
          href="/profile/refund-requests"
          className="block w-full text-left px-4 py-2 text-muted hover:bg-surface rounded-lg transition-colors"
        >
          {t("order.myRefundRequests")}
        </Link>
        <Link
          href="/support"
          className="block w-full text-left px-4 py-2 text-muted hover:bg-surface rounded-lg transition-colors"
        >
          {t("support.contactSupport")}
        </Link>
      </div>
    </SectionCard>
  );
}
