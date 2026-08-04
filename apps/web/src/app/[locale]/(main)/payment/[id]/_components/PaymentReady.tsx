/** @format */

"use client";

import { useCallback } from "react";
import { Link } from "@/i18n/navigation";
import { LockClosedIcon, XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import CardPaymentSection from "@/components/payment/CardPaymentSection";
import { useCardPayment, type PaymentTarget } from "@/hooks/useCardPayment";
import AmountSummaryCard, { type TradePricingLines } from "./AmountSummaryCard";

interface PaymentReadyProps {
  target: PaymentTarget;
  paymentId: string;
  amount?: number;
  pricing?: TradePricingLines | null;
  cardStorageEnabled?: boolean;
  hasTarget: boolean;
  onCancel: () => void;
  cancelling: boolean;
  retry: () => void;
}

/**
 * Ödemeye hazır ekran — checkout ile AYNI iskelet: solda kart bilgileri,
 * sağda yapışkan özet sütunu (tutar + "Güvenli Öde" + vazgeç). İki ekranın
 * tek farkı verinin yönü: burada sipariş ve ödeme kaydı ZATEN vardır, hedef
 * çözücü hazır id'leri döndürür; checkout'ta aynı bölüm siparişi submit
 * anında oluşturur.
 */
export default function PaymentReady({
  target,
  paymentId,
  amount,
  pricing,
  cardStorageEnabled = false,
  hasTarget,
  onCancel,
  cancelling,
  retry,
}: PaymentReadyProps) {
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
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {hasTarget ? (
          <CardPaymentSection card={card} />
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

      <div className="lg:col-span-1">
        <div className="space-y-4 lg:sticky lg:top-24">
          <AmountSummaryCard amount={amount} pricing={pricing} />

          {hasTarget && (
            <div className="space-y-2">
              <Button
                onClick={submit}
                disabled={processing || loadingCards}
                isLoading={processing}
                size="lg"
                className="w-full"
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
              <Button
                variant="ghost"
                className="w-full"
                onClick={onCancel}
                isLoading={cancelling}
                disabled={processing}
              >
                Vazgeç ve geri dön
              </Button>
            </div>
          )}

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
      </div>
    </div>
  );
}
