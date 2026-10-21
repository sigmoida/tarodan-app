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
import {
  paymentPurpose,
  takesDistanceSalesConsent,
  type PaymentKind,
} from "@/lib/paymentKind";
import AmountSummaryCard, { type TradePricingLines } from "./AmountSummaryCard";

interface PaymentReadyProps {
  target: PaymentTarget;
  paymentId: string;
  /**
   * The loaded payment's kind (its API flags, not only the URL `type`). It
   * decides the PayTR store (saved cards) and the distance sales consent.
   */
  kind: PaymentKind;
  amount?: number;
  pricing?: TradePricingLines | null;
  cardStorageEnabled?: boolean;
  hasTarget: boolean;
  onCancel: () => void;
  cancelling: boolean;
  retry: () => void;
}

/**
 * The ready-to-pay view, the SAME layout as checkout: card details on the
 * left, a sticky summary column on the right (amount, contract consent for a
 * sale of goods, pay, cancel). The only difference is the direction of the
 * data: here the order and the payment row already exist and the resolver
 * returns their ids; checkout creates the order at submit.
 */
export default function PaymentReady({
  target,
  paymentId,
  kind,
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
  // A sale of goods takes the same precondition as checkout: no charge
  // without the distance sales contract. The consent goes to the server with
  // the payment form request (an offer order has no checkout step, so this is
  // where it is recorded). A platform service (membership, boost) has its own
  // consents: no checkbox, and nothing is sent.
  const needsDistanceSales = takesDistanceSalesConsent(kind);
  const [distanceSalesAccepted, setDistanceSalesAccepted] = useState(false);
  const card = useCardPayment({
    purpose: paymentPurpose(kind),
    cardStorageEnabled,
    resolvePayment,
    distanceSalesAccepted: needsDistanceSales
      ? distanceSalesAccepted
      : undefined,
  });
  const { processing, loadingCards, submit } = card;

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
              {needsDistanceSales && (
                <DistanceSalesConsent
                  checked={distanceSalesAccepted}
                  onChange={setDistanceSalesAccepted}
                />
              )}
              <Button
                onClick={submit}
                disabled={
                  processing ||
                  loadingCards ||
                  (needsDistanceSales && !distanceSalesAccepted)
                }
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
