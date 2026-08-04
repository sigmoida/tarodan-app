/** @format */

"use client";

import {
  ShieldCheckIcon,
  LockClosedIcon,
  CheckCircleIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Spinner } from "@tarodan/ui";
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
 * Kayıtlı kartı olan kullanıcı için varsayılan yüzey kart listesidir; yeni kart
 * formuna başlıktaki düğmeyle geçilir (iki mod aynı anda görünmez, yüzey sade
 * kalır). Kayıtlı kartı olmayan kullanıcı doğrudan sade formu görür.
 *
 * Gönder düğmesi BURADA DEĞİL: iki ekranda da tutarın görüldüğü özet sütununda
 * durur (checkout'ta sözleşme onayına ve adres doğrulamasına da bakar). Düğmeyi
 * çağırana bırakmak iki ekranın kuralını bu bileşene taşımaktan iyidir.
 */
export default function CardPaymentSection({
  card,
  title = "Kart Bilgileri",
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

  const usingNewCard = selected === NEW_CARD;
  const hasSavedCards = cards.length > 0;

  return (
    <SectionCard
      title={title}
      action={
        loadingCards ? undefined : hasSavedCards ? (
          usingNewCard ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(cards[0].id)}
            >
              Kayıtlı Kart İle Öde
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelected(NEW_CARD)}
            >
              <PlusIcon className="h-4 w-4" />
              Kart Ekle
            </Button>
          )
        ) : (
          <Badge
            variant="success"
            icon={<LockClosedIcon className="h-3.5 w-3.5" />}
          >
            Güvenli
          </Badge>
        )
      }
    >
      {loadingCards ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted">
          <Spinner size="sm" /> Kartlar yükleniyor…
        </div>
      ) : usingNewCard ? (
        <NewCardFields
          form={form}
          cardStorageEnabled={cardStorageEnabled}
          saveCard={saveCard}
          onSaveCardChange={setSaveCard}
        />
      ) : (
        <div className="space-y-3">
          <SavedCardList
            cards={cards}
            selected={selected}
            onSelect={setSelected}
            savedCvv={savedCvv}
            onSavedCvvChange={setSavedCvv}
          />
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
