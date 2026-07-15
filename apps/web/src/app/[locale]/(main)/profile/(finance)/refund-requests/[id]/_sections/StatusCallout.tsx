/** @format */

"use client";

import {
  CheckIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { resolveLocale } from "@tarodan/i18n";
import type { RefundRequest } from "../../_lib/types";

type Tone = "success" | "danger" | "warning";

const DATE_LOCALES = { en: "en-US", tr: "tr-TR" } as const;

const TONE: Record<
  Tone,
  { wrap: string; icon: string; title: string; body: string }
> = {
  success: {
    wrap: "bg-success-50 border-success-200",
    icon: "text-success-600",
    title: "text-success-800",
    body: "text-success-700",
  },
  danger: {
    wrap: "bg-danger-50 border-danger-200",
    icon: "text-danger-600",
    title: "text-danger-800",
    body: "text-danger-700",
  },
  warning: {
    wrap: "bg-warning-50 border-warning-200",
    icon: "text-warning-600",
    title: "text-warning-800",
    body: "text-warning-700",
  },
};

function Callout({
  tone,
  icon,
  title,
  children,
}: {
  tone: Tone;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const c = TONE[tone];
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-5 ${c.wrap}`}>
      <span className={`mt-0.5 flex-shrink-0 ${c.icon}`}>{icon}</span>
      <div>
        <p className={`font-semibold ${c.title}`}>{title}</p>
        <div className={`mt-1 text-sm ${c.body}`}>{children}</div>
      </div>
    </div>
  );
}

/** Terminal / attention callout for refunded, rejected and disputed states. */
export default function StatusCallout({
  refund,
  locale,
}: {
  refund: RefundRequest;
  locale: string;
}) {
  const t = useTranslations();
  if (refund.status === "refunded") {
    return (
      <Callout
        tone="success"
        icon={<CheckIcon className="h-6 w-6" />}
        title={t("refund.completedSuccess")}
      >
        <p>{t("refund.refundedBody")}</p>
        {refund.refundedAt && (
          <p className="mt-2 text-xs">
            {t("refund.refundedAt")}
            {new Date(refund.refundedAt).toLocaleString(
              DATE_LOCALES[resolveLocale(locale)],
            )}
          </p>
        )}
      </Callout>
    );
  }

  if (refund.status === "rejected") {
    return (
      <Callout
        tone="danger"
        icon={<XCircleIcon className="h-6 w-6" />}
        title={t("refund.requestRejected")}
      >
        <p>{t("refund.rejectedBody")}</p>
      </Callout>
    );
  }

  if (refund.status === "disputed") {
    return (
      <Callout
        tone="warning"
        icon={<ExclamationTriangleIcon className="h-6 w-6" />}
        title={t("refund.underAdminReview")}
      >
        <p>{t("refund.disputedBody")}</p>
      </Callout>
    );
  }

  return null;
}
