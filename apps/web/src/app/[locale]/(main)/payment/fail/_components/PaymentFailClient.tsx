/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import {
  ExclamationTriangleIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Badge, Spinner } from "@tarodan/ui";
import type { MessageKey } from "@tarodan/i18n";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { SectionCard, ButtonLink } from "@/components/ui";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { usePaymentFail } from "../_hooks/usePaymentFail";
import { formatTL } from "@/lib/format";
import type { PaymentKind } from "../../_lib/paymentKind";
import PaymentResultIcon from "../../_components/PaymentResultIcon";

const REASON_KEYS = [
  "payment.reasonInsufficientBalance",
  "payment.reasonCardError",
  "payment.reason3dSecureFailed",
  "payment.reasonBankRejected",
  "payment.reasonConnectionProblem",
] as const;

/** Per kind: the title, the description and the two buttons. */
const COPY: Record<
  PaymentKind,
  {
    title: MessageKey;
    description: MessageKey;
    back: MessageKey;
    retry: MessageKey;
  }
> = {
  checkout: {
    title: "payment.paymentFailed",
    description: "payment.failedDesc",
    back: "payment.backToMyOrders",
    retry: "common.tryAgain",
  },
  membership: {
    title: "payment.paymentFailed",
    description: "payment.failedDesc",
    back: "page.payment.paymentpageclient.uyelikSayfasinaDon",
    retry: "common.tryAgain",
  },
  boost: {
    title: "payment.boost.fail.title",
    description: "payment.boost.fail.description",
    back: "payment.boost.toBoosts",
    retry: "payment.boost.fail.retry",
  },
};

export default function PaymentFailClient() {
  const t = useTranslations();
  const { phase, payment, isGuestCheckout, kind, routes, cancelled } =
    usePaymentFail();

  if (phase === "auth-loading") return <AuthLoadingScreen />;
  if (phase === "loading") {
    return (
      <PageShell className="flex min-h-[60vh] items-center justify-center">
        <Spinner size="xl" />
      </PageShell>
    );
  }

  const copy = COPY[kind];

  return (
    <PageShell className="flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <SectionCard className="p-8 text-center">
          <PaymentResultIcon tone={cancelled ? "cancelled" : "failed"} />

          <h1 className="mb-2 text-3xl font-bold text-heading">
            {cancelled ? t("payment.boost.cancelled") : t(copy.title)}
          </h1>
          {!cancelled && (
            <p className="mb-6 text-muted">{t(copy.description)}</p>
          )}

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
                    {formatTL(payment.amount)}
                  </span>
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

          {/* The usual reasons a card is declined; not for the buyer's own cancel. */}
          {!cancelled && (
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
          )}

          {/*
            Destek yönlendirmesi ekranın tek yardım yolu, bu yüzden metin duruyor;
            yalnız mavi kutu kaldırıldı (success ekranıyla aynı sadeleştirme).
          */}
          <p className="mb-6 text-left text-sm text-muted">
            <strong className="text-body">{t("payment.needHelp")}</strong>{" "}
            {t("payment.supportPrompt")}
            <Link
              href="/support"
              className="font-medium text-primary-600 underline"
            >
              {t("payment.supportTeam")}
            </Link>
            {t("payment.contactSuffix")}
          </p>

          {/* Butonlar kartın tam genişliğini paylaşır; ikincil eylem solda. */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {isGuestCheckout && kind === "checkout" ? (
              <ButtonLink href={routes.retry} className="flex-1">
                {t("seller.backToListings")}
              </ButtonLink>
            ) : (
              <>
                <ButtonLink
                  variant="secondary"
                  href={routes.back}
                  className="flex-1"
                >
                  {t(copy.back)}
                </ButtonLink>
                <ButtonLink href={routes.retry} className="flex-1 gap-2">
                  {t(copy.retry)}
                  <ChevronRightIcon className="h-5 w-5" />
                </ButtonLink>
              </>
            )}
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
