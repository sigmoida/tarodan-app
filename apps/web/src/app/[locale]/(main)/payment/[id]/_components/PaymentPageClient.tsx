/** @format */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { XCircleIcon } from "@heroicons/react/24/outline";
import { Button, Spinner } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionCard } from "@/components/ui";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { usePaymentStatus } from "../_hooks/usePaymentStatus";
import AmountSummaryCard from "./AmountSummaryCard";
import CardPaymentForm from "./CardPaymentForm";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <PageShell className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">{children}</div>
    </PageShell>
  );
}

export default function PaymentPageClient() {
  const router = useRouter();
  const {
    phase,
    payment,
    recurringEnabled,
    handleCancel,
    retry,
    directTarget,
    hasTarget,
    isMembershipPayment,
    onCardSuccess,
  } = usePaymentStatus();

  if (phase === "auth-loading") return <AuthLoadingScreen />;

  if (phase === "loading") {
    return (
      <Centered>
        <Spinner size="xl" className="mx-auto mb-4" />
        <p className="text-muted">Ödeme bilgileri yükleniyor...</p>
      </Centered>
    );
  }

  if (phase === "notfound") {
    return (
      <Centered>
        <XCircleIcon className="mx-auto mb-4 h-12 w-12 text-danger-500" />
        <p className="mb-4 text-muted">Ödeme bulunamadı</p>
        <Button
          onClick={() =>
            router.push(isMembershipPayment ? "/membership" : "/profile/orders")
          }
        >
          {isMembershipPayment ? "Üyelik Sayfasına Dön" : "Siparişlerime Dön"}
        </Button>
      </Centered>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Ödeme"
        description="PayTR ile güvenli ödeme"
        onBack={handleCancel}
        backLabel="Vazgeç ve geri dön"
      />

      <div className="mx-auto grid w-full gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-start">
        {/* Sol: tutar + yardım + vazgeç (alt alta) */}
        <div className="space-y-4">
          <AmountSummaryCard amount={payment.amount} />

          <div className="rounded-xl border border-info-200 bg-info-50 p-4">
            <p className="text-sm text-info-800">
              <strong>Yardıma mı ihtiyacınız var?</strong> Ödeme sırasında sorun
              yaşarsanız, lütfen{" "}
              <Link href="/support" className="font-medium underline">
                destek ekibimiz
              </Link>{" "}
              ile iletişime geçin.
            </p>
          </div>
        </div>

        {/* Sağ: kart ödeme formu */}
        <div>
          {hasTarget ? (
            <CardPaymentForm
              target={directTarget}
              amount={payment.amount}
              recurringEnabled={recurringEnabled}
              onSuccess={onCardSuccess}
            />
          ) : (
            <SectionCard className="text-center">
              <XCircleIcon className="mx-auto mb-4 h-14 w-14 text-danger-500" />
              <h2 className="mb-2 text-xl font-semibold">
                Ödeme Bilgisi Bulunamadı
              </h2>
              <p className="mb-6 text-muted">
                Ödeme hedefi yüklenemedi. Lütfen tekrar deneyin.
              </p>
              <Button onClick={retry}>Tekrar Dene</Button>
            </SectionCard>
          )}
        </div>
      </div>
    </PageShell>
  );
}
