/** @format */

"use client";

import {
  ShieldCheckIcon,
  LockClosedIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Spinner } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useCardPayment } from "../_hooks/useCardPayment";
import { NEW_CARD } from "../_lib/card";
import SavedCardList from "./SavedCardList";
import NewCardFields from "./NewCardFields";

interface CardPaymentFormProps {
  target: { orderId?: string; checkoutGroupId?: string; tradeId?: string };
  paymentId: string;
  amount?: number;
  cardStorageEnabled?: boolean;
}

export default function CardPaymentForm({
  target,
  paymentId,
  amount,
  cardStorageEnabled = false,
}: CardPaymentFormProps) {
  const {
    form,
    cards,
    loadingCards,
    selected,
    setSelected,
    savedCvv,
    setSavedCvv,
    saveCard,
    setSaveCard,
    processing,
    submit,
  } = useCardPayment({ target, paymentId, cardStorageEnabled });

  const amountLabel =
    amount != null
      ? `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`
      : null;

  return (
    <SectionCard
      title="Kart ile Öde"
      action={
        <Badge
          variant="success"
          icon={<LockClosedIcon className="h-3.5 w-3.5" />}
        >
          Güvenli
        </Badge>
      }
    >
      <p className="-mt-3 mb-4 text-sm text-muted">
        PayTR güvenli ödeme altyapısı
      </p>

      {loadingCards ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted">
          <Spinner size="sm" /> Kartlar yükleniyor…
        </div>
      ) : (
        <div className="space-y-3">
          {cards.length > 0 && (
            <SavedCardList
              cards={cards}
              selected={selected}
              onSelect={setSelected}
              savedCvv={savedCvv}
              onSavedCvvChange={setSavedCvv}
            />
          )}

          {selected === NEW_CARD && (
            <NewCardFields
              form={form}
              cardStorageEnabled={cardStorageEnabled}
              saveCard={saveCard}
              onSaveCardChange={setSaveCard}
            />
          )}
        </div>
      )}

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

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheckIcon className="h-4 w-4 text-success-500" /> 256-bit SSL
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircleIcon className="h-4 w-4 text-success-500" /> PayTR
          güvencesi
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LockClosedIcon className="h-4 w-4 text-success-500" /> Kart verileri
          PayTR korumasında
        </span>
      </div>
    </SectionCard>
  );
}
