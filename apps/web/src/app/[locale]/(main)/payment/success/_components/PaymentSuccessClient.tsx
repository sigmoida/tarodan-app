/** @format */

"use client";

import {
  CheckCircleIcon,
  ClockIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { Spinner } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { PageShell } from "@/components/layout/PageShell";
import { SectionCard, ButtonLink } from "@/components/ui";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { usePaymentSuccess } from "../_hooks/usePaymentSuccess";
import { getEstimatedDelivery } from "../_lib/delivery";
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
    isAuthenticated,
    orderIdFromUrl,
    locale,
  } = usePaymentSuccess();

  if (phase === "auth-loading") return <AuthLoadingScreen />;
  if (phase === "client-loading" || phase === "loading") return <Loading />;

  // Grup ödemesinde anchor = grubun ilk siparişi (grup ekranına çözülür).
  const orderId =
    payment?.orderId ?? payment?.orders?.[0]?.id ?? orderIdFromUrl;

  return (
    <PageShell className="flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <SectionCard className="p-8 text-center">
          <div
            className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
              isCompleted ? "bg-success-100" : "bg-warning-100"
            }`}
          >
            {isCompleted ? (
              <CheckCircleIcon className="h-12 w-12 text-success-500" />
            ) : (
              <ClockIcon className="h-12 w-12 text-warning-600" />
            )}
          </div>

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
                href={
                  orderId ? `/profile/orders/${orderId}` : "/profile/orders"
                }
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
