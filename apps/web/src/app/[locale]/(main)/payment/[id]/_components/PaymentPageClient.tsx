/** @format */

"use client";

import { useRouter } from "@/i18n/navigation";
import { XCircleIcon } from "@heroicons/react/24/outline";
import { Button, Spinner } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { usePaymentStatus } from "../_hooks/usePaymentStatus";
import PaymentReady from "./PaymentReady";
import { useTranslations } from "next-intl";
import type { MessageKey } from "@tarodan/i18n";
import type { PaymentKind } from "@/lib/paymentKind";

/** The not-found button: back to the purchase's own list. */
const BACK_LABEL: Record<PaymentKind, MessageKey> = {
  checkout: "page.payment.paymentpageclient.siparislerimeDon",
  membership: "page.payment.paymentpageclient.uyelikSayfasinaDon",
  boost: "payment.boost.toBoosts",
};

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <PageShell className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">{children}</div>
    </PageShell>
  );
}

/**
 * The screen for returning to an unfinished payment. The lifecycle (loading,
 * not found, routing a finished payment away) lives here; the ready-to-pay
 * view is `PaymentReady`, the same layout as checkout, without a page title.
 */
export default function PaymentPageClient() {
  const t = useTranslations();
  const router = useRouter();
  const {
    phase,
    payment,
    cardStorageEnabled,
    cancelling,
    handleCancel,
    retry,
    directTarget,
    hasTarget,
    kind,
    routes,
  } = usePaymentStatus();

  if (phase === "auth-loading") return <AuthLoadingScreen />;

  if (phase === "loading") {
    return (
      <Centered>
        <Spinner size="xl" className="mx-auto mb-4" />
        <p className="text-muted">
          {t("page.payment.paymentpageclient.odemeBilgileriYukleniyor")}
        </p>
      </Centered>
    );
  }

  if (phase === "notfound") {
    return (
      <Centered>
        <XCircleIcon className="mx-auto mb-4 h-12 w-12 text-danger-500" />
        <p className="mb-4 text-muted">
          {t("page.payment.paymentpageclient.odemeBulunamadi")}
        </p>
        <Button onClick={() => router.push(routes.back)}>
          {t(BACK_LABEL[kind])}
        </Button>
      </Centered>
    );
  }

  return (
    <PageShell>
      <PaymentReady
        target={directTarget}
        paymentId={payment.id}
        kind={kind}
        amount={payment.amount}
        // Only a trade payment returns line items (a cart or order payment
        // has its own summary on the cart screen).
        pricing={payment.tradeId ? payment.pricing : null}
        cardStorageEnabled={cardStorageEnabled}
        hasTarget={hasTarget}
        onCancel={handleCancel}
        cancelling={cancelling}
        retry={retry}
      />
    </PageShell>
  );
}
