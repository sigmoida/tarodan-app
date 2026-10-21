/** @format */

"use client";

import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { SectionCard, ButtonLink } from "@/components/ui";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { formatDateTime } from "@/lib/format";
import { usePaymentSuccess } from "../_hooks/usePaymentSuccess";
import { getEstimatedDelivery } from "../_lib/delivery";
import { MY_LISTINGS_PATH, MY_ORDERS_PATH } from "@/lib/paymentKind";
import PaymentResultIcon from "../../_components/PaymentResultIcon";
import PaymentDetailsCard from "./PaymentDetailsCard";

function Loading() {
  return (
    <PageShell className="flex min-h-[60vh] items-center justify-center">
      <Spinner size="xl" />
    </PageShell>
  );
}

export default function PaymentSuccessClient() {
  const t = useTranslations();
  const {
    phase,
    isCompleted,
    payment,
    kind,
    boost,
    routes,
    isAuthenticated,
    orderIdFromUrl,
    locale,
  } = usePaymentSuccess();

  if (phase === "auth-loading") return <AuthLoadingScreen />;
  if (phase === "client-loading" || phase === "loading") return <Loading />;

  if (kind === "boost") {
    // Activation runs in the payment's own transaction: a completed payment
    // has the boost's end. Before the callback it is "starting". A completed
    // payment WITHOUT an end means activation was skipped (a Sentry error on
    // the API); it will not start by itself, so the page claims only the
    // payment, never that the boost starts.
    const endsAt = boost?.endsAt ?? null;
    const view = !isCompleted ? "pending" : endsAt ? "started" : "paid";
    return (
      <PageShell className="flex items-center justify-center p-4">
        <div className="w-full max-w-2xl">
          <SectionCard className="p-8 text-center">
            <PaymentResultIcon
              tone={view === "pending" ? "pending" : "success"}
            />
            <h1 className="mb-2 text-3xl font-bold text-heading">
              {view === "started"
                ? t("payment.boost.success.title")
                : view === "paid"
                  ? t("payment.completedTitle")
                  : t("payment.confirmingTitle")}
            </h1>
            {view === "started" && boost && endsAt && (
              <p className="mb-6 text-muted">
                {t("payment.boost.success.description", {
                  listing: boost.productTitle,
                  date: formatDateTime(endsAt),
                })}
              </p>
            )}
            {view === "pending" && (
              <p className="mb-6 text-muted">
                {t("payment.boost.success.pending")}
              </p>
            )}

            {payment && (
              <div className="mb-6">
                <PaymentDetailsCard
                  payment={payment}
                  isCompleted={isCompleted}
                  showInvoiceNote={false}
                />
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <ButtonLink
                variant="secondary"
                href={MY_LISTINGS_PATH}
                className="flex-1"
              >
                {t("payment.boost.toListings")}
              </ButtonLink>
              <ButtonLink href={routes.back} className="flex-1 gap-2">
                {t("payment.boost.toBoosts")}
                <ChevronRightIcon className="h-5 w-5" />
              </ButtonLink>
            </div>
          </SectionCard>
        </div>
      </PageShell>
    );
  }

  // Grup ödemesinde anchor = grubun ilk siparişi (grup ekranına çözülür).
  const orderId =
    payment?.orderId ?? payment?.orders?.[0]?.id ?? orderIdFromUrl;

  return (
    <PageShell className="flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <SectionCard className="p-8 text-center">
          <PaymentResultIcon tone={isCompleted ? "success" : "pending"} />

          <h1 className="mb-2 text-3xl font-bold text-heading">
            {isCompleted
              ? t("payment.completedTitle")
              : t("payment.confirmingTitle")}
          </h1>
          <p className="mb-6 text-muted">
            {isCompleted
              ? t("payment.completedDesc")
              : t("payment.confirmingDesc")}
          </p>

          {payment && (
            <div className="mb-6">
              <PaymentDetailsCard payment={payment} isCompleted={isCompleted} />
            </div>
          )}

          {payment?.createdAt && (
            <div className="mb-6 rounded-lg border border-border p-4">
              <p className="mb-1 font-semibold text-heading">
                {t("payment.estimatedDelivery")}
              </p>
              <p className="font-medium text-body">
                {getEstimatedDelivery(payment.createdAt, locale)}
              </p>
              <p className="mt-2 text-xs text-subtle">
                {t("payment.deliveryDisclaimer")}
              </p>
            </div>
          )}

          {/* Butonlar kartın tam genişliğini paylaşır; ikincil eylem solda. */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink variant="secondary" href="/listings" className="flex-1">
              {t("cart.continueShopping")}
            </ButtonLink>
            {isAuthenticated ? (
              <ButtonLink
                href={orderId ? `${MY_ORDERS_PATH}/${orderId}` : MY_ORDERS_PATH}
                className="flex-1 gap-2"
              >
                {t("payment.viewMyOrder")}
                <ChevronRightIcon className="h-5 w-5" />
              </ButtonLink>
            ) : (
              <ButtonLink href="/track-order" className="flex-1 gap-2">
                {t("payment.trackMyOrder")}
                <ChevronRightIcon className="h-5 w-5" />
              </ButtonLink>
            )}
          </div>
        </SectionCard>
      </div>
    </PageShell>
  );
}
