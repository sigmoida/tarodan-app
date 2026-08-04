/** @format */

"use client";

import { useRouter } from "@/i18n/navigation";
import { XCircleIcon } from "@heroicons/react/24/outline";
import { Button, Spinner } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { Container } from "@/components/layout/Container";
import AuthLoadingScreen from "@/components/AuthLoadingScreen";
import { usePaymentStatus } from "../_hooks/usePaymentStatus";
import PaymentReady from "./PaymentReady";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <PageShell className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">{children}</div>
    </PageShell>
  );
}

/**
 * Yarım kalmış bir ödemeye dönüş ekranı. Yaşam döngüsü (yükleme, bulunamadı,
 * tamamlanmışı yönlendirme) burada; ödemeye hazır görünüm `PaymentReady`'de —
 * checkout ile aynı iskelet, sayfa başlığı yok.
 */
export default function PaymentPageClient() {
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
    isMembershipPayment,
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
      <Container className="pt-4">
        <PaymentReady
          target={directTarget}
          paymentId={payment.id}
          amount={payment.amount}
          // Kalemler yalnız takas ödemesinde döner (grup/sipariş ödemesinin
          // kendi özeti sepet ekranındadır).
          pricing={payment.tradeId ? payment.pricing : null}
          cardStorageEnabled={cardStorageEnabled}
          hasTarget={hasTarget}
          onCancel={handleCancel}
          cancelling={cancelling}
          retry={retry}
        />
      </Container>
    </PageShell>
  );
}
