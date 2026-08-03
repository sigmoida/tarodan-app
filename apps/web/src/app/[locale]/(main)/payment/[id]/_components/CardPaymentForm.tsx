/** @format */

"use client";

import { useCallback } from "react";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import CardPaymentSection from "@/components/payment/CardPaymentSection";
import { useCardPayment, type PaymentTarget } from "@/hooks/useCardPayment";

interface CardPaymentFormProps {
  target: PaymentTarget;
  paymentId: string;
  amount?: number;
  cardStorageEnabled?: boolean;
}

/**
 * Ödeme sayfasının kart formu: sipariş ve ödeme kaydı ZATEN vardır, bu yüzden
 * hedef çözücü hazır id'leri döndürür. Tek sayfalık checkout aynı bölümü
 * kullanır ama orada çözücü siparişi o an oluşturur.
 */
export default function CardPaymentForm({
  target,
  paymentId,
  amount,
  cardStorageEnabled = false,
}: CardPaymentFormProps) {
  const resolvePayment = useCallback(
    async () => ({ paymentId, target }),
    [paymentId, target],
  );
  const card = useCardPayment({ cardStorageEnabled, resolvePayment });
  const { processing, loadingCards, submit } = card;

  const amountLabel =
    amount != null
      ? `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
      : null;

  return (
    <CardPaymentSection card={card}>
      <Button
        onClick={submit}
        disabled={processing || loadingCards}
        isLoading={processing}
        size="lg"
        className="mt-6 w-full"
      >
        {processing ? (
          "İşleniyor…"
        ) : (
          <span className="flex items-center justify-center gap-2">
            <LockClosedIcon className="h-5 w-5" />
            {amountLabel ? `${amountLabel} Güvenli Öde` : "Güvenli Öde"}
          </span>
        )}
      </Button>
    </CardPaymentSection>
  );
}
