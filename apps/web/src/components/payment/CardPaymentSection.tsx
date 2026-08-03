/** @format */

"use client";

import {
  ShieldCheckIcon,
  LockClosedIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { Badge, Spinner } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import type { useCardPayment } from "@/hooks/useCardPayment";
import { NEW_CARD } from "./card";
import SavedCardList from "./SavedCardList";
import NewCardFields from "./NewCardFields";

export type CardPaymentState = ReturnType<typeof useCardPayment>;

/**
 * Kart seçim + giriş yüzeyi. Ödeme SAYFASI ve tek sayfalık checkout aynı
 * bileşeni kullanır; kart verisinin nasıl toplandığı tek yerde tanımlıdır.
 *
 * Gönder düğmesi BURADA DEĞİL: checkout'ta düğme sözleşme onayına ve adres
 * doğrulamasına da bakar, ödeme sayfasında ise tek iş yapar. Düğmeyi çağırana
 * bırakmak iki ekranın kuralını bu bileşene taşımaktan iyidir.
 */
export default function CardPaymentSection({
  card,
  title = "Kart ile Öde",
  children,
}: {
  card: CardPaymentState;
  title?: string;
  /** Gönder düğmesi ve ekrana özel notlar. */
  children?: React.ReactNode;
}) {
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
    cardStorageEnabled,
  } = card;

  return (
    <SectionCard
      title={title}
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

      {children}

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
