/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import {
  XCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { SectionCard, ButtonLink } from "@/components/ui";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { usePaymentFail } from "../_hooks/usePaymentFail";

const REASON_KEYS = [
  "payment.reasonInsufficientBalance",
  "payment.reasonCardError",
  "payment.reason3dSecureFailed",
  "payment.reasonBankRejected",
  "payment.reasonConnectionProblem",
] as const;

export default function PaymentFailClient() {
  const t = useTranslations();
  const { phase, payment, isGuestCheckout, handleRetry } = usePaymentFail();

  if (phase === "auth-loading") return <AuthLoadingScreen />;
  if (phase === "loading") {
    return (
      <PageShell className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="xl" />
      </PageShell>
    );
  }

  return (
    <PageShell className="flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <SectionCard className="p-8 text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-danger-100">
            <XCircleIcon className="h-12 w-12 text-danger-500" />
          </div>

          <h1 className="mb-2 text-3xl font-bold text-heading">
            {t("payment.paymentFailed")}
          </h1>
          <p className="mb-6 text-muted">{t("payment.failedDesc")}</p>

          {payment && (
            <SectionCard
              title={t("payment.detailsTitle")}
              className="mb-6 text-left"
            >
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">
                    {t("payment.amountLabel")}:
                  </span>
                  <span className="font-semibold">
                    {payment.amount?.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    TL
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">
                    {t("checkout.paymentMethod")}:
                  </span>
                  <span className="font-semibold">PayTR</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">{t("common.status")}:</span>
                  <Badge variant="danger">
                    {t("trade.shipmentStatus.failed")}
                  </Badge>
                </div>
                {payment.failureReason && (
                  <div className="mt-3 border-t border-border pt-3 text-xs text-muted">
                    <strong>{t("common.error")}:</strong>{" "}
                    {payment.failureReason}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          <div className="mb-6 rounded-lg border border-warning-200 bg-warning-50 p-4 text-left">
            <div className="flex items-start gap-3 text-sm text-warning-800">
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning-600" />
              <div>
                <p className="mb-2 font-semibold">
                  {t("payment.failureReasonsTitle")}
                </p>
                <ul className="list-inside list-disc space-y-1 text-xs">
                  {REASON_KEYS.map((key) => (
                    <li key={key}>{t(key)}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-info-200 bg-info-50 p-4 text-left text-sm text-info-800">
            <strong>{t("payment.needHelp")}</strong>{" "}
            {t("payment.supportPrompt")}
            <Link href="/support" className="font-medium underline">
              {t("payment.supportTeam")}
            </Link>
            {t("payment.contactSuffix")}
          </div>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            {isGuestCheckout ? (
              <ButtonLink href="/listings">
                {t("seller.backToListings")}
              </ButtonLink>
            ) : (
              <>
                <Button onClick={handleRetry}>{t("common.tryAgain")}</Button>
                <ButtonLink variant="secondary" href="/profile/orders">
                  {t("payment.backToMyOrders")}
                </ButtonLink>
              </>
            )}
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
