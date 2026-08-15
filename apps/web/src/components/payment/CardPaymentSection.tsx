/** @format */

"use client";

import { useTranslations } from "next-intl";
import { Button, Spinner } from "@tarodan/ui";
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
  title,
  children,
}: {
  card: CardPaymentState;
  title?: string;
  /** Gönder düğmesi ve ekrana özel notlar. */
  children?: React.ReactNode;
}) {
  const t = useTranslations();
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
      title={title ?? t("checkout.cardSection")}
      action={
        loadingCards || !hasSavedCards ? undefined : usingNewCard ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelected(cards[0].id)}
          >
            {t("checkout.payWithSavedCard")}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelected(NEW_CARD)}
          >
            {t("payment.addCard")}
          </Button>
        )
      }
    >
      {loadingCards ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted">
          <Spinner size="sm" /> {t("checkout.loadingCards")}
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
    </SectionCard>
  );
}
