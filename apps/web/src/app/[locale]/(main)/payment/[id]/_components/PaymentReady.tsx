/** @format */

"use client";

import { useCallback, useState } from "react";
import { Link } from "@/i18n/navigation";
import { XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/ui";
import CardPaymentSection from "@/components/payment/CardPaymentSection";
import DistanceSalesConsent from "@/components/payment/DistanceSalesConsent";
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
 * sağda yapışkan özet sütunu (tutar + sözleşme onayı + "Ödeme Yap" + vazgeç).
 * İki ekranın tek farkı verinin yönü: burada sipariş ve ödeme kaydı ZATEN
 * vardır, hedef çözücü hazır id'leri döndürür; checkout'ta aynı bölüm siparişi
 * submit anında oluşturur.
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
  const t = useTranslations();
  const resolvePayment = useCallback(
    async () => ({ paymentId, target }),
    [paymentId, target],
  );
  const card = useCardPayment({ cardStorageEnabled, resolvePayment });
  const { processing, loadingCards, submit } = card;
  // Checkout ile aynı ön koşul: sözleşme onaylanmadan tahsilat başlatılmaz.
  const [distanceSalesAccepted, setDistanceSalesAccepted] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {hasTarget ? (
          <CardPaymentSection card={card} />
        ) : (
          <SectionCard className="text-center">
            <XCircleIcon className="mx-auto mb-4 h-14 w-14 text-danger-500" />
            <h2 className="mb-2 text-xl font-semibold">
              {t("page.payment.paymentready.odemeBilgisiBulunamadi")}
            </h2>
            <p className="mb-6 text-muted">
              {t(
                "page.payment.paymentready.odemeHedefiYuklenemediLutfenTekrarDeneyin",
              )}
            </p>
            <Button onClick={retry}>
              {t("page.payment.paymentready.tekrarDene")}
            </Button>
          </SectionCard>
        )}
      </div>

      <div className="lg:col-span-1">
        <div className="space-y-4 lg:sticky lg:top-24">
          <AmountSummaryCard amount={amount} pricing={pricing} />

          {hasTarget && (
            <div className="space-y-3">
              <DistanceSalesConsent
                checked={distanceSalesAccepted}
                onChange={setDistanceSalesAccepted}
              />
              <Button
                onClick={submit}
                disabled={processing || loadingCards || !distanceSalesAccepted}
                isLoading={processing}
                size="lg"
                className="w-full"
              >
                {processing
                  ? t("page.payment.paymentready.isleniyor")
                  : t("checkout.payNow")}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={onCancel}
                isLoading={cancelling}
                disabled={processing}
              >
                {t("page.payment.paymentready.vazgecVeGeriDon")}
              </Button>
            </div>
          )}

          <div className="rounded-xl border border-warning-200 bg-warning-50 p-4">
            <p className="text-sm text-warning-800">
              {t.rich("page.payment.paymentready.bYardimaMiIhtiyacinizVarB", {
                b: (chunks) => <strong>{chunks}</strong>,
                link2: (chunks) => (
                  <Link href="/support" className="font-medium underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
